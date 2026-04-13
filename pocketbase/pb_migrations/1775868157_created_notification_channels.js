/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "id": "qtbj0fodab8is0w",
    "name": "notification_channels",
    "type": "base",
    "system": false,
    "schema": [
      {"system":false,"id":"cxhe03i9","name":"type","type":"select","required":true,"presentable":false,"unique":false,"options":{"maxSelect":1,"values":["pushbullet","webhook","email"]}},
      {"system":false,"id":"guxhwyum","name":"name","type":"text","required":true,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"7by0qqqy","name":"config","type":"json","required":false,"presentable":false,"unique":false,"options":{"maxSize":2000000}},
      {"system":false,"id":"cosbodyq","name":"enabled","type":"bool","required":false,"presentable":false,"unique":false,"options":{}},
      {"system":false,"id":"bfjmykun","name":"user","type":"relation","required":false,"presentable":false,"unique":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":false,"minSelect":null,"maxSelect":1,"displayFields":null}}
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
  const collection = dao.findCollectionByNameOrId("qtbj0fodab8is0w")
  return dao.deleteCollection(collection)
})
