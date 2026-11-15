import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, SectionHeader } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { useRpg } from '@/rpg/rpg-store';
import { villageStyles as styles } from '@/rpg/village-styles';

/** 마을 방치 수련 시설과 이웃 동료 영입·배치 */
export function IdlePanel() {
  const { state, upgradeFacility, assignPartnerToFacility, recruitPartner } = useRpg();
  return (
    <View style={{ gap: Spacing.md }}>
      <SectionHeader title="마을 방치 수련 시설" description="시설 레벨을 올리고 동료를 배치해 자동 수급량을 늘리세요" />
      {state.facilities.map((fac) => {
        const assignedPartner = state.partners.find((p) => p.assignedFacilityId === fac.id);
        const canUpgrade = state.stats.acorns >= fac.upgradeCost;
        return (
          <Card key={fac.id} style={styles.facilityCard}>
            <View style={styles.facilityTopRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                  {fac.name} (Lv.{fac.level})
                </AppText>
                <AppText variant="caption" style={{ color: '#526451' }}>
                  기본 생산: +{fac.baseAcornsPerSec} 도토리/초 · +{fac.baseExpPerSec} EXP/초
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${fac.name} 레벨 올리기, 도토리 ${fac.upgradeCost}개`}
                accessibilityState={{ disabled: !canUpgrade }}
                disabled={!canUpgrade}
                onPress={() => upgradeFacility(fac.id)}
                style={[styles.upgradeBtn, panelStyles.touchTarget, !canUpgrade && { opacity: 0.55 }]}>
                <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.strong }}>
                  레벨업 (도토리 {fac.upgradeCost}개)
                </AppText>
              </Pressable>
            </View>
            <View style={styles.partnerAssignRow}>
              <AppText variant="caption" style={{ color: '#0E5142', fontFamily: FontWeights.emphasis }}>
                담당 파트너: {assignedPartner ? `${assignedPartner.avatar} ${assignedPartner.name} (${assignedPartner.roleTitle})` : '미배치 (효과 없음)'}
              </AppText>
            </View>
          </Card>
        );
      })}

      <SectionHeader title="영입 가능한 이웃 동료" description="마을 어르신을 영입하고 시설에 배치하세요" />
      <View style={{ gap: Spacing.sm }}>
        {state.partners.map((partner) => {
          const canRecruit = !partner.recruited && state.stats.acorns >= partner.recruitCost;
          return (
            <Card key={partner.id} style={styles.partnerCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <AppText style={{ fontSize: 32 }}>{partner.avatar}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ color: '#182620' }}>
                    {partner.name} · {partner.roleTitle}
                  </AppText>
                  <AppText variant="caption" style={{ color: '#526451' }}>
                    {partner.description}
                  </AppText>
                </View>
              </View>
              {partner.recruited ? (
                  <View style={panelStyles.assignmentRow}>
                    {(['parkgolf', 'alkkagi', 'sacheonseong'] as const).map((fid) => (
                      <Pressable
                        key={fid}
                        accessibilityRole="button"
                        accessibilityLabel={`${partner.name}, ${fid === 'parkgolf' ? '파크골프' : fid === 'alkkagi' ? '기원' : '다실'}에 배치`}
                        accessibilityState={{ selected: partner.assignedFacilityId === fid }}
                        onPress={() => assignPartnerToFacility(partner.id, fid)}
                        style={[
                          styles.assignMiniBtn,
                          panelStyles.assignmentButton,
                          partner.assignedFacilityId === fid && styles.assignMiniBtnActive,
                        ]}>
                        <AppText variant="bodyStrong" style={{ color: partner.assignedFacilityId === fid ? '#FCF9F2' : '#182620' }}>
                          {fid === 'parkgolf' ? '골프' : fid === 'alkkagi' ? '기원' : '다실'}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${partner.name} 영입, 도토리 ${partner.recruitCost}개`}
                    accessibilityState={{ disabled: !canRecruit }}
                    disabled={!canRecruit}
                    onPress={() => recruitPartner(partner.id)}
                    style={[styles.upgradeBtn, panelStyles.recruitButton, !canRecruit && { opacity: 0.55 }]}>
                    <AppText variant="caption" style={{ color: '#FCF9F2', fontFamily: FontWeights.strong }}>
                      영입 (도토리 {partner.recruitCost}개)
                    </AppText>
                  </Pressable>
                )}
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  touchTarget: { minHeight: 48, justifyContent: 'center' },
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  assignmentButton: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  recruitButton: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', marginTop: Spacing.sm },
});
