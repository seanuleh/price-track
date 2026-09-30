/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("notification_channels")
  collection.fields.getByName("type").values = ["pushbullet", "webhook", "email", "ntfy"]
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("notification_channels")
  collection.fields.getByName("type").values = ["pushbullet", "webhook", "email"]
  app.save(collection)
})
