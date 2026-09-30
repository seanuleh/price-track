/// <reference path="../pb_data/types.d.ts" />
// PocketBase 0.23+ syntax (rewritten from the 0.22 Dao version; same timestamp, so
// already-applied databases skip it).
// All five base collections are created here, in dependency order: 0.23+ validates
// relation targets on save, and the sibling 1775868157_created_* files sort *before*
// their targets exist. Those siblings are now no-ops.
migrate((app) => {
  app.save(new Collection({
    id: "lgrm272zrta0icu",
    name: "products",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "url", type: "url" },
      { name: "image_url", type: "url" },
      { name: "description", type: "text" },
      { name: "brand", type: "text" },
      { name: "model", type: "text" },
      { name: "category", type: "text" },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))

  app.save(new Collection({
    id: "nw6650ctsgdu1sa",
    name: "retailers",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "product", type: "relation", required: true, collectionId: "lgrm272zrta0icu", cascadeDelete: true, maxSelect: 1 },
      { name: "name", type: "text", required: true },
      { name: "url", type: "url", required: true },
      { name: "selector", type: "text" },
      { name: "enabled", type: "bool" },
      { name: "last_price", type: "number", min: 0 },
      { name: "last_checked", type: "date" },
      { name: "is_scraping", type: "bool" },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))

  app.save(new Collection({
    id: "oasks2rhe63qpx6",
    name: "alerts",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "product", type: "relation", required: true, collectionId: "lgrm272zrta0icu", cascadeDelete: true, maxSelect: 1 },
      { name: "target_price", type: "number", min: 0 },
      { name: "condition", type: "select", required: true, maxSelect: 1, values: ["below", "above", "any_change", "any_drop"] },
      { name: "enabled", type: "bool" },
      { name: "triggered_at", type: "date" },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))

  app.save(new Collection({
    id: "oxa9zxjmiuostv9",
    name: "price_history",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "retailer", type: "relation", required: true, collectionId: "nw6650ctsgdu1sa", cascadeDelete: true, maxSelect: 1 },
      { name: "product", type: "relation", required: true, collectionId: "lgrm272zrta0icu", cascadeDelete: true, maxSelect: 1 },
      { name: "price", type: "number", required: true, min: 0 },
      { name: "currency", type: "text" },
      { name: "in_stock", type: "bool" },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))

  app.save(new Collection({
    id: "qtbj0fodab8is0w",
    name: "notification_channels",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["pushbullet", "webhook", "email"] },
      { name: "name", type: "text", required: true },
      { name: "config", type: "json", maxSize: 2000000 },
      { name: "enabled", type: "bool" },
      { name: "user", type: "relation", required: false, collectionId: "_pb_users_auth_", cascadeDelete: false, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("notification_channels"))
  app.delete(app.findCollectionByNameOrId("price_history"))
  app.delete(app.findCollectionByNameOrId("alerts"))
  app.delete(app.findCollectionByNameOrId("retailers"))
  app.delete(app.findCollectionByNameOrId("products"))
})
