package fixture

import (
	"bonisoft.org/plugins/pronto/k8s/schema"
	"bonisoft.org/plugins/pronto/k8s/envs"
)

App: schema.#ReleaseSpec & {
	name: "minimal"
	render: enabled: false
}

kindManifests: (schema.#BuildManifests & {release: App, env: envs.Kind}).manifests
eksManifests: (schema.#BuildManifests & {release: App, env: envs.EKS}).manifests
aksManifests: (schema.#BuildManifests & {release: App, env: envs.AKS}).manifests
