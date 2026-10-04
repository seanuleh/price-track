/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("products")
  collection.fields.add(new NumberField({ name: "sort_order", onlyInt: true }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("products")
  collection.fields.removeByName("sort_order")
  app.save(collection)
})
