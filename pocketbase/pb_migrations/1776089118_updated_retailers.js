/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("nw6650ctsgdu1sa")

  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  collection.createRule = "@request.auth.id != \"\""
  collection.updateRule = "user = @request.auth.id"
  collection.deleteRule = "user = @request.auth.id"

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("nw6650ctsgdu1sa")

  collection.listRule = ""
  collection.viewRule = ""
  collection.createRule = ""
  collection.updateRule = ""
  collection.deleteRule = ""

  app.save(collection)
})
