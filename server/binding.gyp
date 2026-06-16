{
  "targets": [
    {
      "target_name": "game_engine",
      "sources": [
        "src/native/addon.cpp",
        "src/native/game_engine.cpp",
        "src/native/snake.cpp",
        "src/native/food.cpp",
        "src/native/msgpack_writer.cpp",
        "src/native/spatial_grid.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags":    [ "-O2", "-march=native" ],
      "cflags!":   [ "-fno-exceptions" ],
      "cflags_cc": [ "-O2", "-march=native", "-std=c++17" ],
      "cflags_cc!":[ "-fno-exceptions" ],
      "defines":   [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "Optimization": 2,
          "AdditionalOptions": [ "/std:c++17" ]
        }
      }
    }
  ]
}
