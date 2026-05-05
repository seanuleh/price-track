/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")
  collection.schema.addField(new SchemaField({
    "name": "default_check_interval_minutes",
    "type": "number",
    "required": false,
    "options": { "min": 5, "max": 10080, "noDecimal": true }
  }))
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_")
  collection.schema.removeField(collection.schema.getFieldByName("default_check_interval_minutes").id)
  return dao.saveCollection(collection)
})
