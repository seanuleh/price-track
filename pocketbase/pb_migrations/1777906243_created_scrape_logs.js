/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "name": "scrape_logs",
    "type": "base",
    "system": false,
    "schema": [
      {"name":"retailer","type":"relation","required":false,"options":{"collectionId":"nw6650ctsgdu1sa","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"name":"product","type":"relation","required":false,"options":{"collectionId":"lgrm272zrta0icu","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"name":"status","type":"select","required":true,"options":{"maxSelect":1,"values":["success","error","blocked"]}},
      {"name":"duration_ms","type":"number","required":false,"options":{"min":0,"max":null,"noDecimal":true}},
      {"name":"error_reason","type":"text","required":false,"options":{"min":null,"max":500,"pattern":""}},
      {"name":"price","type":"number","required":false,"options":{"min":0,"max":null,"noDecimal":false}},
      {"name":"user","type":"relation","required":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}}
    ],
    "indexes": [],
    "listRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id",
    "createRule": "@request.auth.id != ''",
    "updateRule": null,
    "deleteRule": "user = @request.auth.id",
    "options": {}
  })

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("scrape_logs")
  return dao.deleteCollection(collection)
})
