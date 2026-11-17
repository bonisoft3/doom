package fixture

import (
	"bonisoft.org/plugins/pronto/k8s/schema"
	"bonisoft.org/plugins/pronto/k8s/envs"
)

App: schema.#ReleaseSpec & {name: "unreached"}
kindManifests: (schema.#BuildManifests & {release: App, env: envs.Kind}).manifests
