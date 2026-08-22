# Model RPC boundary

The service-to-service boundary is `kokoro.model.v1.ModelCatalogService/ResolveModel`.
The authoritative protobuf source remains in the Root repository under
`contract/proto/kokoro/model/v1/model_catalog.proto`; generated TypeScript files in
`src/generated/proto` are checked artifacts and must be regenerated from an exact Root contract
commit, never edited manually.
