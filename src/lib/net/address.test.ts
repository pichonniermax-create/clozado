import { describe, expect, it } from "vitest";
import { isPublicAddress, parseIPv4, parseIPv6 } from "./address";

describe("parseIPv4 / parseIPv6", () => {
  it("lit les écritures canoniques et refuse les autres", () => {
    expect(parseIPv4("192.168.1.10")).toEqual([192, 168, 1, 10]);
    expect(parseIPv4("256.1.1.1")).toBeNull();
    expect(parseIPv4("0x7f.0.0.1")).toBeNull();
    expect(parseIPv4("127.1")).toBeNull();
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("2a01:e0a:1:2::3")).toEqual([0x2a01, 0xe0a, 1, 2, 0, 0, 0, 3]);
    expect(parseIPv6("::ffff:10.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001]);
    expect(parseIPv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("1::2::3")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIPv6("g::1")).toBeNull();
  });
});

describe("isPublicAddress — IPv4", () => {
  it("accepte des adresses publiques", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "91.198.174.192", "185.199.108.153", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.169.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
  it("refuse la boucle locale, le lien local (dont les métadonnées d'instance), RFC 1918, 0.0.0.0, le partage d'opérateur, la documentation, la multidiffusion", () => {
    for (const ip of [
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254",
      "169.254.0.1",
      "10.0.0.5",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "0.0.0.0",
      "0.1.2.3",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.2.1",
      "198.51.100.7",
      "203.0.113.9",
      "198.18.0.1",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});

describe("isPublicAddress — IPv6", () => {
  it("accepte des adresses publiques, avec ou sans crochets", () => {
    for (const ip of ["2a00:1450:4007:80e::200e", "[2606:4700:4700::1111]", "2001:4860:4860::8888", "2002:0808:0808::1", "64:ff9b::808:808"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
  it("refuse ::1, ::, le lien local, les adresses locales uniques, la multidiffusion, la documentation, le trou noir", () => {
    for (const ip of ["::1", "::", "[::1]", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "fc00::1", "fd12:3456:789a::1", "fdff::1", "ff02::1", "2001:db8::1", "100::1", "64:ff9b:1::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("classe l'IPv4 embarquée : ::ffff:10.0.0.1, ::ffff:127.0.0.1, NAT64 et 6to4 vers du privé sont refusés", () => {
    for (const ip of ["::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:0a00:0001", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "2002:0a00:0001::1", "2002:7f00:1::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });
  it("refuse les formes obsolètes ::/96 (« IPv4-compatible ») et ::ffff:0:0:0/96 (« IPv4-translated »), même vers du public", () => {
    for (const ip of ["::127.0.0.1", "::7f00:1", "[::127.0.0.1]", "::8.8.8.8", "::ffff:0:127.0.0.1", "::ffff:0:7f00:1", "::ffff:0:8.8.8.8", "::2"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("ferme le doute : une forme illisible n'est pas publique", () => {
    expect(isPublicAddress("")).toBe(false);
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("2130706433")).toBe(false);
    expect(isPublicAddress("0x7f000001")).toBe(false);
  });
});
