// Runtime configuration for SIGAB endpoints.
(function () {
  "use strict";

  var defaultConfig = {
    STRAPI_BASE: "http://172.20.108.129:1337",
    CNC_BASE: "http://192.168.1.140/"
  };

  // Allow overriding with a preloaded global without breaking legacy behavior.
  window.SIGAB_CONFIG = Object.assign({}, defaultConfig, window.SIGAB_CONFIG || {});
})();
