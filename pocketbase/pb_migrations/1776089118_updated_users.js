/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.createRule = null
  collection.deleteRule = null

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.createRule = ""
  collection.deleteRule = "id = @request.auth.id"

  app.save(collection)
})
