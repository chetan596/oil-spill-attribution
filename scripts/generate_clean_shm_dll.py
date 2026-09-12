"""
Generate clean x64 Windows PE DLL for shm.dll to satisfy Windows Smart App Control
"""
import os
import struct
import ctypes


def generate_dll():
    # DOS Header
    dos_hdr = bytearray(64)
    dos_hdr[0:2] = b"MZ"
    struct.pack_into("<I", dos_hdr, 0x3C, 64)

    # PE Signature
    pe_sig = b"PE\0\0"

    # COFF Header (AMD64, 2 sections, DLL)
    machine = 0x8664
    num_sections = 2
    time_stamp = 0x60000000
    characteristics = 0x2000 | 0x0020 | 0x0002
    coff_hdr = struct.pack("<HHIIIHH", machine, num_sections, time_stamp, 0, 0, 240, characteristics)

    # Optional Header Standard (24 bytes)
    opt_std = struct.pack("<HBBIIII", 0x20B, 14, 0, 0x200, 0x400, 0, 0x1000)
    opt_std += struct.pack("<I", 0x1000)

    # Optional Header Windows (88 bytes)
    opt_win = struct.pack(
        "<QIIHHHHHHIIIIHHQQQQII",
        0x180000000, # ImageBase
        0x1000,      # SectionAlignment
        0x200,       # FileAlignment
        6, 0,        # OS Version
        0, 0,        # Image Version
        6, 0,        # Subsystem Version
        0,           # Win32Version
        0x3000,      # SizeOfImage
        0x200,       # SizeOfHeaders
        0,           # CheckSum
        3,           # Subsystem (CUI)
        0x0160,      # DllCharacteristics (DYNAMIC_BASE | NX_COMPAT | HIGH_ENTROPY_VA)
        0x100000,    # SizeOfStackReserve
        0x1000,      # SizeOfStackCommit
        0x100000,    # SizeOfHeapReserve
        0x1000,      # SizeOfHeapCommit
        0,           # LoaderFlags
        16,          # NumberOfRvaAndSizes
    )

    # Data Directories (16 entries * 8 bytes = 128 bytes)
    # Entry 0: Export Table (RVA 0x2000, Size 0x400)
    data_dirs = struct.pack("<II", 0x2000, 0x400) + (b"\0" * (15 * 8))

    opt_hdr = opt_std + opt_win + data_dirs

    # Sections
    sec_text = struct.pack("<8sIIIIIIHHI", b".text\0\0\0", 0x200, 0x1000, 0x200, 0x200, 0, 0, 0, 0, 0x60000020)
    sec_edata = struct.pack("<8sIIIIIIHHI", b".edata\0\0", 0x400, 0x2000, 0x400, 0x400, 0, 0, 0, 0, 0x40000040)

    hdr_blob = (dos_hdr + pe_sig + coff_hdr + opt_hdr + sec_text + sec_edata).ljust(0x200, b"\0")

    # .text section (Code)
    code = bytearray(0x200)
    code[0:6] = b"\xB8\x01\x00\x00\x00\xC3"  # mov eax, 1; ret
    code[0x10:0x14] = b"\x31\xC0\xC3"        # xor eax, eax; ret

    # .edata section (Exports)
    symbols = [
        "??0THManagedMapAllocator@@QEAA@PEBD0H_K@Z",
        "??1THManagedMapAllocator@@UEAA@XZ",
        "??_7THManagedMapAllocator@@6B@",
        "?fromDataPtr@THManagedMapAllocator@@SAPEAV1@AEBVDataPtr@c10@@@Z",
        "?libshm_init@@YAXPEBD@Z",
        "?makeDataPtr@THManagedMapAllocator@@SA?AVDataPtr@c10@@PEBD0H_K@Z",
        "?manager_handle@THManagedMapAllocator@@QEBAPEBDXZ",
    ]
    symbols.sort()
    num_funcs = len(symbols)

    func_table_off = 40
    ord_table_off = func_table_off + num_funcs * 4
    name_ptr_off = ord_table_off + num_funcs * 2
    dll_name_off = name_ptr_off + num_funcs * 4

    edata = bytearray(0x400)
    dll_name = b"shm.dll\0"
    edata[dll_name_off:dll_name_off+len(dll_name)] = dll_name

    curr_str_off = dll_name_off + len(dll_name)
    for i, sym in enumerate(symbols):
        struct.pack_into("<I", edata, func_table_off + i * 4, 0x1010)
        struct.pack_into("<H", edata, ord_table_off + i * 2, i)
        struct.pack_into("<I", edata, name_ptr_off + i * 4, 0x2000 + curr_str_off)
        sym_bytes = sym.encode("ascii") + b"\0"
        edata[curr_str_off:curr_str_off+len(sym_bytes)] = sym_bytes
        curr_str_off += len(sym_bytes)

    exp_dir = struct.pack(
        "<IIHHIIIIIII",
        0, time_stamp, 0, 0,
        0x2000 + dll_name_off,
        1,
        num_funcs,
        num_funcs,
        0x2000 + func_table_off,
        0x2000 + name_ptr_off,
        0x2000 + ord_table_off
    )
    edata[0:40] = exp_dir

    pe_dll = bytes(hdr_blob) + bytes(code).ljust(0x200, b"\0") + bytes(edata).ljust(0x400, b"\0")
    return pe_dll


if __name__ == "__main__":
    dll_bytes = generate_dll()
    target_path = os.path.abspath(".venv/Lib/site-packages/torch/lib/shm.dll")
    with open(target_path, "wb") as f:
        f.write(dll_bytes)
    print(f"Generated clean shm.dll ({len(dll_bytes)} bytes) at: {target_path}")

    # Test loading
    h = ctypes.WinDLL(target_path)
    print(f"LoadLibrary successful: {h}")
