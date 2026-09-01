#!/usr/bin/env bash
set -euo pipefail

REGION="ap-northeast-2"
CLUSTER="senior-club"
SERVICE="senior-club-api"
SECRET_ID="senior-club/api"

if [[ ${1:-} == "--help" ]]; then
  printf 'Usage: %s [--dry-run]\n' "$0"
  printf 'Twilio 값을 숨김 입력받아 Secrets Manager와 ECS SMS provider를 갱신합니다.\n'
  exit 0
fi
if [[ $# -gt 0 && $1 != "--dry-run" ]]; then
  printf '알 수 없는 옵션: %s\n' "$1" >&2
  exit 2
fi

for command in aws jq; do
  command -v "$command" >/dev/null || {
    printf '%s가 설치되어 있지 않습니다.\n' "$command" >&2
    exit 1
  }
done

aws sts get-caller-identity --output text >/dev/null
task_definition=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].taskDefinition' \
  --output text)

if [[ ${1:-} == "--dry-run" ]]; then
  printf 'AWS 연결과 ECS 서비스를 확인했습니다.\n'
  printf '현재 작업 정의: %s\n' "$task_definition"
  printf '실행 시 Twilio 값을 숨김 입력받아 %s와 새 ECS revision에 연결합니다.\n' "$SECRET_ID"
  exit 0
fi

read -r -p 'Twilio Account SID (AC...): ' account_sid
read -r -s -p 'Twilio Auth Token: ' auth_token
printf '\n'
read -r -p 'Twilio Messaging Service SID (MG...): ' messaging_service_sid

[[ $account_sid =~ ^AC[[:xdigit:]]{32}$ ]] || {
  printf 'Account SID 형식이 올바르지 않습니다.\n' >&2
  exit 1
}
[[ ${#auth_token} -ge 16 ]] || {
  printf 'Auth Token이 너무 짧습니다.\n' >&2
  exit 1
}
[[ $messaging_service_sid =~ ^MG[[:xdigit:]]{32}$ ]] || {
  printf 'Messaging Service SID 형식이 올바르지 않습니다.\n' >&2
  exit 1
}

secret_file=$(mktemp)
task_file=$(mktemp)
register_file=$(mktemp)
trap 'rm -f "$secret_file" "$task_file" "$register_file"' EXIT
chmod 600 "$secret_file"

aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query SecretString \
  --output text |
  jq \
    --arg account_sid "$account_sid" \
    --arg auth_token "$auth_token" \
    --arg messaging_service_sid "$messaging_service_sid" \
    '. + {
      TWILIO_ACCOUNT_SID: $account_sid,
      TWILIO_AUTH_TOKEN: $auth_token,
      TWILIO_MESSAGING_SERVICE_SID: $messaging_service_sid
    }' >"$secret_file"

aws secretsmanager update-secret \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --secret-string "file://$secret_file" \
  --query ARN \
  --output text >/dev/null

secret_arn=$(aws secretsmanager describe-secret \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query ARN \
  --output text)

aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --region "$REGION" \
  --query taskDefinition \
  --output json >"$task_file"

jq \
  --arg secret_arn "$secret_arn" \
  'del(
      .taskDefinitionArn,
      .revision,
      .status,
      .requiresAttributes,
      .compatibilities,
      .registeredAt,
      .registeredBy,
      .deregisteredAt
    )
    | .containerDefinitions[0].environment = (
        (.containerDefinitions[0].environment // [])
        | map(select(.name != "SMS_PROVIDER"))
        + [{name: "SMS_PROVIDER", value: "twilio"}]
      )
    | .containerDefinitions[0].secrets = (
        (.containerDefinitions[0].secrets // [])
        | map(select(.name != "TWILIO_ACCOUNT_SID"
          and .name != "TWILIO_AUTH_TOKEN"
          and .name != "TWILIO_MESSAGING_SERVICE_SID"))
        + [
            {name: "TWILIO_ACCOUNT_SID", valueFrom: ($secret_arn + ":TWILIO_ACCOUNT_SID::")},
            {name: "TWILIO_AUTH_TOKEN", valueFrom: ($secret_arn + ":TWILIO_AUTH_TOKEN::")},
            {name: "TWILIO_MESSAGING_SERVICE_SID", valueFrom: ($secret_arn + ":TWILIO_MESSAGING_SERVICE_SID::")}
          ]
      )' "$task_file" >"$register_file"

new_task_definition=$(aws ecs register-task-definition \
  --region "$REGION" \
  --cli-input-json "file://$register_file" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$new_task_definition" \
  --force-new-deployment \
  --region "$REGION" \
  --query 'service.taskDefinition' \
  --output text

printf 'ECS 안정화를 기다립니다.\n'
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

printf 'Twilio SMS provider 배포 완료: %s\n' "$new_task_definition"
