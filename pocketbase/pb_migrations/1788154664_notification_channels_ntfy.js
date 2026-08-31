/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("notification_channels")
  const field = collection.schema.getFieldByName("type")
  field.options.values = ["pushbullet", "webhook", "email", "ntfy"]
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("notification_channels")
  const field = collection.schema.getFieldByName("type")
  field.options.values = ["pushbullet", "webhook", "email"]
  return dao.saveCollection(collection)
})
