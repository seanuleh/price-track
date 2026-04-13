/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "id": "oxa9zxjmiuostv9",
    "name": "price_history",
    "type": "base",
    "system": false,
    "schema": [
      {"system":false,"id":"hggq8qqf","name":"retailer","type":"relation","required":true,"presentable":false,"unique":false,"options":{"collectionId":"nw6650ctsgdu1sa","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"system":false,"id":"m39n6hkj","name":"product","type":"relation","required":true,"presentable":false,"unique":false,"options":{"collectionId":"lgrm272zrta0icu","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"system":false,"id":"int0du8c","name":"price","type":"number","required":true,"presentable":false,"unique":false,"options":{"min":0,"max":null,"noDecimal":false}},
      {"system":false,"id":"4hwaezj1","name":"currency","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"ausdqxjq","name":"in_stock","type":"bool","required":false,"presentable":false,"unique":false,"options":{}},
      {"system":false,"id":"e1jadxcp","name":"user","type":"relation","required":false,"presentable":false,"unique":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}}
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
  const collection = dao.findCollectionByNameOrId("oxa9zxjmiuostv9")
  return dao.deleteCollection(collection)
})
