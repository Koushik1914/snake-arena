#include "msgpack_writer.h"

void MsgPackWriter::write_nil() {
    buffer.push_back(0xc0);
}

void MsgPackWriter::write_bool(bool b) {
    buffer.push_back(b ? 0xc3 : 0xc2);
}

void MsgPackWriter::write_int(int64_t v) {
    if (v >= 0) {
        write_uint(static_cast<uint64_t>(v));
    } else {
        if (v >= -32) {
            buffer.push_back(static_cast<uint8_t>(v));
        } else if (v >= -128) {
            buffer.push_back(0xd0);
            buffer.push_back(static_cast<uint8_t>(v));
        } else if (v >= -32768) {
            buffer.push_back(0xd1);
            buffer.push_back(static_cast<uint8_t>((v >> 8) & 0xff));
            buffer.push_back(static_cast<uint8_t>(v & 0xff));
        } else if (v >= -2147483648LL) {
            buffer.push_back(0xd2);
            buffer.push_back(static_cast<uint8_t>((v >> 24) & 0xff));
            buffer.push_back(static_cast<uint8_t>((v >> 16) & 0xff));
            buffer.push_back(static_cast<uint8_t>((v >> 8) & 0xff));
            buffer.push_back(static_cast<uint8_t>(v & 0xff));
        } else {
            buffer.push_back(0xd3);
            for (int i = 7; i >= 0; i--) {
                buffer.push_back(static_cast<uint8_t>((v >> (i * 8)) & 0xff));
            }
        }
    }
}

void MsgPackWriter::write_uint(uint64_t v) {
    if (v <= 127) {
        buffer.push_back(static_cast<uint8_t>(v));
    } else if (v <= 255) {
        buffer.push_back(0xcc);
        buffer.push_back(static_cast<uint8_t>(v));
    } else if (v <= 65535) {
        buffer.push_back(0xcd);
        buffer.push_back(static_cast<uint8_t>((v >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(v & 0xff));
    } else if (v <= 4294967295ULL) {
        buffer.push_back(0xce);
        buffer.push_back(static_cast<uint8_t>((v >> 24) & 0xff));
        buffer.push_back(static_cast<uint8_t>((v >> 16) & 0xff));
        buffer.push_back(static_cast<uint8_t>((v >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(v & 0xff));
    } else {
        buffer.push_back(0xcf);
        for (int i = 7; i >= 0; i--) {
            buffer.push_back(static_cast<uint8_t>((v >> (i * 8)) & 0xff));
        }
    }
}

void MsgPackWriter::write_float(float v) {
    uint32_t val;
    std::memcpy(&val, &v, sizeof(v));
    buffer.push_back(0xca);
    buffer.push_back(static_cast<uint8_t>((val >> 24) & 0xff));
    buffer.push_back(static_cast<uint8_t>((val >> 16) & 0xff));
    buffer.push_back(static_cast<uint8_t>((val >> 8) & 0xff));
    buffer.push_back(static_cast<uint8_t>(val & 0xff));
}

void MsgPackWriter::write_double(double v) {
    uint64_t val;
    std::memcpy(&val, &v, sizeof(v));
    buffer.push_back(0xcb);
    for (int i = 7; i >= 0; i--) {
        buffer.push_back(static_cast<uint8_t>((val >> (i * 8)) & 0xff));
    }
}

void MsgPackWriter::write_str(const std::string& s) {
    uint32_t len = static_cast<uint32_t>(s.length());
    if (len <= 31) {
        buffer.push_back(static_cast<uint8_t>(0xa0 | len));
    } else if (len <= 255) {
        buffer.push_back(0xd9);
        buffer.push_back(static_cast<uint8_t>(len));
    } else if (len <= 65535) {
        buffer.push_back(0xda);
        buffer.push_back(static_cast<uint8_t>((len >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(len & 0xff));
    } else {
        buffer.push_back(0xdb);
        buffer.push_back(static_cast<uint8_t>((len >> 24) & 0xff));
        buffer.push_back(static_cast<uint8_t>((len >> 16) & 0xff));
        buffer.push_back(static_cast<uint8_t>((len >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(len & 0xff));
    }
    buffer.insert(buffer.end(), s.begin(), s.end());
}

void MsgPackWriter::write_array_header(uint32_t size) {
    if (size <= 15) {
        buffer.push_back(static_cast<uint8_t>(0x90 | size));
    } else if (size <= 65535) {
        buffer.push_back(0xdc);
        buffer.push_back(static_cast<uint8_t>((size >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(size & 0xff));
    } else {
        buffer.push_back(0xdd);
        buffer.push_back(static_cast<uint8_t>((size >> 24) & 0xff));
        buffer.push_back(static_cast<uint8_t>((size >> 16) & 0xff));
        buffer.push_back(static_cast<uint8_t>((size >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(size & 0xff));
    }
}

void MsgPackWriter::write_map_header(uint32_t size) {
    if (size <= 15) {
        buffer.push_back(static_cast<uint8_t>(0x80 | size));
    } else if (size <= 65535) {
        buffer.push_back(0xde);
        buffer.push_back(static_cast<uint8_t>((size >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(size & 0xff));
    } else {
        buffer.push_back(0xdf);
        buffer.push_back(static_cast<uint8_t>((size >> 24) & 0xff));
        buffer.push_back(static_cast<uint8_t>((size >> 16) & 0xff));
        buffer.push_back(static_cast<uint8_t>((size >> 8) & 0xff));
        buffer.push_back(static_cast<uint8_t>(size & 0xff));
    }
}
