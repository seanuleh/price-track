/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.fields.add(new NumberField({ name: "default_check_interval_minutes", min: 5, max: 10080, onlyInt: true }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.fields.removeByName("default_check_interval_minutes")
  app.save(collection)
})
