#pragma once
#include <vector>
#include <string>
#include <cstdint>
#include <cstring>

class MsgPackWriter {
public:
    std::vector<uint8_t> buffer;

    void write_nil();
    void write_bool(bool b);
    void write_int(int64_t v);
    void write_uint(uint64_t v);
    void write_float(float v);
    void write_double(double v);
    void write_str(const std::string& s);
    void write_array_header(uint32_t size);
    void write_map_header(uint32_t size);
};
