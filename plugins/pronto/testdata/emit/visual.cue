// Visual lint runs as its bkid runner: the inner stack is the runner's own, so
// a check never recreates or tears down the stack a person launched.
package emit

import pronto "bonisoft.org/plugins/pronto"

_visual: (pronto.#DefaultTerminal & {code: _code}).out.surface.checks.visual.cmds
visualRun: _visual & ["use integrate.nu; integrate --bake --no-up --with-buildx --target ci-visual"]
