/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("products")
  collection.schema.addField(new SchemaField({
    "name": "check_interval_minutes",
    "type": "number",
    "required": false,
    "options": { "min": 5, "max": 10080, "noDecimal": true }
  }))
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("products")
  collection.schema.removeField(collection.schema.getFieldByName("check_interval_minutes").id)
  return dao.saveCollection(collection)
})
