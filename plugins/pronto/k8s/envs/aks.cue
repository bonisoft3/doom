package envs

import "bonisoft.org/plugins/pronto/k8s/schema"

// AKS environment definition targeting Azure Kubernetes Service and ACR.
AKS: schema.#Environment & {
	name:            "aks"
	registry:        *"myacr.azurecr.io" | string
	gatewayClassName: *"azure-alb-external" | string
	storageClass:     "managed-csi"
	imagePullPolicy:  "Always"
	platform:         "linux/amd64"
	domainSuffix:     *"aks.internal.net" | string
}
