const RESERVED_HOST_SUFFIXES = [
  'localhost',
  'local',
  'test',
  'invalid',
  'example',
  'internal',
  'home.arpa',
];

const RESERVED_EXAMPLE_DOMAINS = ['example.com', 'example.net', 'example.org'];

function matchesHostnameOrSubdomain(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function parseIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function parseIpv6(hostname) {
  let candidate = hostname;
  if (candidate.startsWith('[') && candidate.endsWith(']')) {
    candidate = candidate.slice(1, -1);
  }

  const compressionParts = candidate.toLowerCase().split('::');
  if (compressionParts.length > 2) return null;

  function parseSide(value) {
    if (!value) return [];

    const groups = value.split(':');
    const last = groups.at(-1);
    if (last?.includes('.')) {
      const ipv4 = parseIpv4(last);
      if (!ipv4) return null;
      groups.splice(
        groups.length - 1,
        1,
        ((ipv4[0] << 8) | ipv4[1]).toString(16),
        ((ipv4[2] << 8) | ipv4[3]).toString(16),
      );
    }

    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => Number.parseInt(group, 16));
  }

  const left = parseSide(compressionParts[0]);
  const right = parseSide(compressionParts[1] ?? '');
  if (!left || !right) return null;

  if (compressionParts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omittedGroups = 8 - left.length - right.length;
  if (omittedGroups < 1) return null;
  return [...left, ...Array(omittedGroups).fill(0), ...right];
}

function ipv4Number(octets) {
  return (
    (((octets[0] << 24) >>> 0) |
      (octets[1] << 16) |
      (octets[2] << 8) |
      octets[3]) >>>
    0
  );
}

function isInIpv4Cidr(octets, base, prefixLength) {
  const address = ipv4Number(octets);
  const network = ipv4Number(base);
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (address & mask) === (network & mask);
}

function getIpv4Violation(octets) {
  const blockedRanges = [
    { base: [0, 0, 0, 0], prefix: 8, reason: '지정되지 않은 IPv4 주소' },
    { base: [10, 0, 0, 0], prefix: 8, reason: '사설 IPv4 주소' },
    { base: [100, 64, 0, 0], prefix: 10, reason: '공유 주소 공간 IPv4 주소' },
    { base: [127, 0, 0, 0], prefix: 8, reason: 'loopback IPv4 주소' },
    { base: [169, 254, 0, 0], prefix: 16, reason: 'link-local IPv4 주소' },
    { base: [172, 16, 0, 0], prefix: 12, reason: '사설 IPv4 주소' },
    { base: [192, 0, 0, 0], prefix: 24, reason: '예약된 IPv4 주소' },
    { base: [192, 0, 2, 0], prefix: 24, reason: '문서 예시용 IPv4 주소' },
    { base: [192, 168, 0, 0], prefix: 16, reason: '사설 IPv4 주소' },
    { base: [198, 18, 0, 0], prefix: 15, reason: '벤치마크용 IPv4 주소' },
    { base: [198, 51, 100, 0], prefix: 24, reason: '문서 예시용 IPv4 주소' },
    { base: [203, 0, 113, 0], prefix: 24, reason: '문서 예시용 IPv4 주소' },
    { base: [224, 0, 0, 0], prefix: 4, reason: 'multicast IPv4 주소' },
    { base: [240, 0, 0, 0], prefix: 4, reason: '예약된 IPv4 주소' },
  ];

  return (
    blockedRanges.find(({ base, prefix }) => isInIpv4Cidr(octets, base, prefix))?.reason ??
    null
  );
}

function getIpv6Violation(groups) {
  const allZero = groups.every((group) => group === 0);
  const loopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  if (allZero) return '지정되지 않은 IPv6 주소';
  if (loopback) return 'loopback IPv6 주소';

  if ((groups[0] & 0xfe00) === 0xfc00) return 'unique-local IPv6 주소';
  if ((groups[0] & 0xffc0) === 0xfe80) return 'link-local IPv6 주소';
  if ((groups[0] & 0xff00) === 0xff00) return 'multicast IPv6 주소';
  if ((groups[0] & 0xffc0) === 0xfec0) return '폐기된 site-local IPv6 주소';

  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    const mappedIpv4 = [
      groups[6] >>> 8,
      groups[6] & 0xff,
      groups[7] >>> 8,
      groups[7] & 0xff,
    ];
    return getIpv4Violation(mappedIpv4);
  }

  if (groups.slice(0, 6).every((group) => group === 0)) {
    return '폐기된 IPv4-compatible IPv6 주소';
  }

  if (groups[0] === 0x0100 && groups.slice(1).every((group) => group === 0)) {
    return 'discard-only IPv6 주소';
  }
  if (groups[0] === 0x2001 && groups[1] === 0x0002) return '벤치마크용 IPv6 주소';
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return '문서 예시용 IPv6 주소';
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) {
    return '문서 예시용 IPv6 주소';
  }

  return null;
}

/**
 * Returns a Korean failure reason when an API URL cannot be used by a release
 * build, or null when its literal host is public. No DNS lookup is performed.
 */
function getPublicApiUrlViolation(apiUrl) {
  const rawHostname = apiUrl.hostname.toLowerCase();
  if (rawHostname.endsWith('.')) {
    return '마침표로 끝나는 비정규 호스트 이름은 사용할 수 없습니다.';
  }

  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return getIpv4Violation(ipv4);

  if (hostname.includes(':')) {
    const ipv6 = parseIpv6(hostname);
    return ipv6 ? getIpv6Violation(ipv6) : '유효하지 않은 IPv6 주소';
  }

  if (!hostname.includes('.')) {
    return '공개 FQDN이 아닌 단일 레이블 호스트 이름';
  }
  const reservedSuffix = RESERVED_HOST_SUFFIXES.find((suffix) =>
    matchesHostnameOrSubdomain(hostname, suffix),
  );
  if (reservedSuffix) return `예약된 .${reservedSuffix} 호스트 이름`;

  const exampleDomain = RESERVED_EXAMPLE_DOMAINS.find((domain) =>
    matchesHostnameOrSubdomain(hostname, domain),
  );
  if (exampleDomain) return `문서 예시용 ${exampleDomain} 호스트 이름`;

  return null;
}

function getReleaseApiUrlViolation(apiUrl) {
  if (apiUrl.protocol !== 'https:') return 'HTTPS가 아닌 프로토콜';
  if (apiUrl.username || apiUrl.password) return 'URL에 포함된 인증 정보';
  if (apiUrl.search) return 'URL에 포함된 쿼리 문자열';
  if (apiUrl.hash) return 'URL에 포함된 해시';
  return getPublicApiUrlViolation(apiUrl);
}

module.exports = {
  getPublicApiUrlViolation,
  getReleaseApiUrlViolation,
};
