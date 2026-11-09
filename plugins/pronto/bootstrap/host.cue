package bootstrap

import (
	"bonisoft.org/plugins/pronto/distribution"
	terminal "bonisoft.org/plugins/pronto/terminals:omnishell"
	"bonisoft.org/plugins/pronto/clusters:mecha"
	"bonisoft.org/plugins/pronto/builders:bayt"
)

// The project every bootstrapped app composes (its pronto/ package), and the
// host roster generate writes for it.
#Host: distribution.#Project & terminal.#Project & mecha.#Project & bayt.#Toolchain

roster: (#Roster & {project: #Host}).out
