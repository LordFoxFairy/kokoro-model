import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createServer, type Server } from "node:http";
import { ModelCatalogService } from "../../generated/proto/kokoro/model/v1/model_catalog_pb.js";
import { createModelCatalogService, type ModelResolver } from "./service.js";

export function createModelRpcServer(resolve: ModelResolver): Server {
  return createServer(
    connectNodeAdapter({
      routes: (router) => {
        router.service(ModelCatalogService, createModelCatalogService(resolve));
      },
    }),
  );
}
