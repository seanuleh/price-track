/// <reference path="../pb_data/types.d.ts" />
// PocketBase 0.23+ syntax (rewritten from the 0.22 Dao version; same timestamp, so
// already-applied databases skip it).
migrate((app) => {
  const collection = new Collection({
    name: "scrape_logs",
    type: "base",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: null,
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "retailer", type: "relation", required: false, collectionId: "nw6650ctsgdu1sa", cascadeDelete: true, maxSelect: 1 },
      { name: "product", type: "relation", required: false, collectionId: "lgrm272zrta0icu", cascadeDelete: true, maxSelect: 1 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["success", "error", "blocked"] },
      { name: "duration_ms", type: "number", min: 0, onlyInt: true },
      { name: "error_reason", type: "text", max: 500 },
      { name: "price", type: "number", min: 0 },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(collection)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("scrape_logs"))
})
