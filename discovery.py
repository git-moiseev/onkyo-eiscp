import os
import socket
import re
import netifaces
from dotenv import load_dotenv
from collections import namedtuple
import struct
import select

_original_ifaddresses = netifaces.ifaddresses


def calculate_broadcast(ip_addr, netmask):
    ip_int = int.from_bytes(socket.inet_aton(ip_addr), "big")
    mask_int = int.from_bytes(socket.inet_aton(netmask), "big")
    broadcast_int = ip_int | (~mask_int & 0xFFFFFFFF)
    return socket.inet_ntoa(broadcast_int.to_bytes(4, "big"))


def fixed_ifaddresses(interface):
    addrs = _original_ifaddresses(interface)

    for ipv4 in addrs.get(netifaces.AF_INET, []):
        addr = ipv4.get("addr")
        netmask = ipv4.get("netmask")

        if addr and netmask:
            ipv4["broadcast"] = calculate_broadcast(addr, netmask)

    return addrs


netifaces.ifaddresses = fixed_ifaddresses

import eiscp
#from eiscp import eISCPPacket, parse_info, eISCP
#
#
#def calculate_broadcast(ip_addr, netmask):
#    ip_int = int.from_bytes(socket.inet_aton(ip_addr), "big")
#    mask_int = int.from_bytes(socket.inet_aton(netmask), "big")
#    broadcast_int = ip_int | (~mask_int & 0xFFFFFFFF)
#    return socket.inet_ntoa(broadcast_int.to_bytes(4, "big"))
#
#
#def discover(timeout=5, clazz=None, discovery_interface=None):
#    """Try to find ISCP devices on the network.
#
#    If discovery_interface is set, discovery is performed only on that interface.
#    Broadcast is calculated from interface IPv4 address and netmask.
#    """
#    onkyo_magic = eISCPPacket('!xECNQSTN').get_raw()
#    pioneer_magic = eISCPPacket('!pECNQSTN').get_raw()
#
#    found_receivers = {}
#
#    if discovery_interface:
#        interfaces = [discovery_interface]
#    else:
#        interfaces = netifaces.interfaces()
#
#    for interface in interfaces:
#        try:
#            ifaddrs = netifaces.ifaddresses(interface)
#        except ValueError:
#            continue
#
#        if netifaces.AF_INET not in ifaddrs:
#            continue
#
#        for ifaddr in ifaddrs[netifaces.AF_INET]:
#            if "addr" not in ifaddr or "netmask" not in ifaddr:
#                continue
#
#            bind_ip = ifaddr["addr"]
#            broadcast_ip = calculate_broadcast(bind_ip, ifaddr["netmask"])
#
#            sock = socket.socket(
#                socket.AF_INET,
#                socket.SOCK_DGRAM,
#                socket.IPPROTO_UDP
#            )
#
#            try:
#                sock.setblocking(0)
#                sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
#                sock.bind((bind_ip, 0))
#
#                sock.sendto(onkyo_magic, (broadcast_ip, eISCP.ONKYO_PORT))
#                sock.sendto(pioneer_magic, (broadcast_ip, eISCP.ONKYO_PORT))
#
#                while True:
#                    ready = select.select([sock], [], [], timeout)
#                    if not ready[0]:
#                        break
#
#                    data, addr = sock.recvfrom(1024)
#                    info = parse_info(data)
#
#                    receiver = (clazz or eISCP)(addr[0], int(info['iscp_port']))
#                    receiver.info = info
#                    found_receivers[info["identifier"]] = receiver
#
#            finally:
#                sock.close()
#
#    return list(found_receivers.values())
#
#eiscp.eISCP.discover = staticmethod(discover)

load_dotenv()

DISCOVERY_INTERFACE = os.getenv("DISCOVERY_INTERFACE") or None

receivers = eiscp.eISCP.discover(timeout=3)

print(receivers)
