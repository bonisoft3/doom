# xBRZ, vendored

`xbrz.js` in this directory is third-party code derived from `xbrz-js@1.9.2`,
vendored as an unbundled pure JavaScript implementation.

## Coordinates

| | |
| --- | --- |
| npm package | `xbrz-js@1.9.2` |
| tarball | `https://registry.npmjs.org/xbrz-js/-/xbrz-js-1.9.2.tgz` |
| tarball sha256 | `09394604a993b216b0cf006eed6ef1dc76a2d734b26e8ce7971c1287f8fc09ca` |
| `xbrz.js` sha256 | `5c4346d1ed72aae7832c2597dad537fcac460d1199fe4b3feceb3184f71c74b3` |
| `LICENSE` sha256 | `c61f12da7cdad526bdcbed47a4c0a603e60dbbfdaf8b66933cd088e9132c303f` |

Upstream: the algorithm is xBRZ by Zenju <https://sourceforge.net/projects/xbrz/>;
the JavaScript port is by Jimbly <https://github.com/Jimbly/xbrz-js>. Both are GPL-3.0.

## Reproducing these bytes

```bash
pnpm dlx npm pack xbrz-js@1.9.2 && tar xzf xbrz-js-1.9.2.tgz package/src/xbrz.js package/src/xbrz_tools.js package/src/xbrz_config.js package/src/xbrz_h.js package/src/xBRZ_1.9/License.txt
```

## The GPLv3 duties, and how they are discharged

Serving these files to a browser is conveying object code, and GPLv3 has no
network exception. The offer taken is **§6(d)**: `LICENSE` (the unmodified
GPLv3 text) and this file are served as statics from the same directory as the
code, so `/shell/units/upscaler/LICENSE` and
`/shell/units/upscaler/NOTICE.md` are reachable beside
`/shell/units/upscaler/xbrz.js`.

**The corresponding source is `xbrz-js@1.9.2` as published, at the coordinates
and hashes above, and is available from the upstream repository and from the
tarball named here at no charge for as long as this app serves the code.**
