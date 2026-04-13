/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "id": "oasks2rhe63qpx6",
    "name": "alerts",
    "type": "base",
    "system": false,
    "schema": [
      {"system":false,"id":"57pr7bos","name":"product","type":"relation","required":true,"presentable":false,"unique":false,"options":{"collectionId":"lgrm272zrta0icu","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"system":false,"id":"edhb4rcx","name":"target_price","type":"number","required":false,"presentable":false,"unique":false,"options":{"min":0,"max":null,"noDecimal":false}},
      {"system":false,"id":"sstcxmgs","name":"condition","type":"select","required":true,"presentable":false,"unique":false,"options":{"maxSelect":1,"values":["below","above","any_change","any_drop"]}},
      {"system":false,"id":"hnzas7mf","name":"enabled","type":"bool","required":false,"presentable":false,"unique":false,"options":{}},
      {"system":false,"id":"dsfnpy0a","name":"triggered_at","type":"date","required":false,"presentable":false,"unique":false,"options":{"min":"","max":""}},
      {"system":false,"id":"se2g7puq","name":"user","type":"relation","required":false,"presentable":false,"unique":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}}
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  })

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oasks2rhe63qpx6")
  return dao.deleteCollection(collection)
})
