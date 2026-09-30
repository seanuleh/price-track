/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("products")
  collection.fields.add(new NumberField({ name: "check_interval_minutes", min: 5, max: 10080, onlyInt: true }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("products")
  collection.fields.removeByName("check_interval_minutes")
  app.save(collection)
})
