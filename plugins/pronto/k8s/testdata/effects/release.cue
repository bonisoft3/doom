package fixture

import (
	"bonisoft.org/plugins/pronto/k8s/schema"
	"bonisoft.org/plugins/pronto/k8s/envs"
)

App: schema.#ReleaseSpec & {name: "effects"}
kindManifests: (schema.#BuildManifests & {release: App, env: envs.Kind}).manifests
