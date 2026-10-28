// A discriminator is four lowercase letters or digits, minted once.
package negative_discriminator

import bayt "bonisoft.org/plugins/bayt/core:bayt"

out: bayt.#project & {
	dir:           "apps/x"
	discriminator: "K4-W"
}
