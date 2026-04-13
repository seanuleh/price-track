/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "id": "nw6650ctsgdu1sa",
    "name": "retailers",
    "type": "base",
    "system": false,
    "schema": [
      {"system":false,"id":"osu1ocxq","name":"product","type":"relation","required":true,"presentable":false,"unique":false,"options":{"collectionId":"lgrm272zrta0icu","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}},
      {"system":false,"id":"jsvnookk","name":"name","type":"text","required":true,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"ejgc6xku","name":"url","type":"url","required":true,"presentable":false,"unique":false,"options":{"exceptDomains":null,"onlyDomains":null}},
      {"system":false,"id":"r9puqn24","name":"selector","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"gqp5ocbs","name":"enabled","type":"bool","required":false,"presentable":false,"unique":false,"options":{}},
      {"system":false,"id":"rkjpjflq","name":"last_price","type":"number","required":false,"presentable":false,"unique":false,"options":{"min":0,"max":null,"noDecimal":false}},
      {"system":false,"id":"33ydepxc","name":"last_checked","type":"date","required":false,"presentable":false,"unique":false,"options":{"min":"","max":""}},
      {"system":false,"id":"tlrptwxt","name":"is_scraping","type":"bool","required":false,"presentable":false,"unique":false,"options":{}},
      {"system":false,"id":"lzvjltkz","name":"user","type":"relation","required":false,"presentable":false,"unique":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}}
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
  const collection = dao.findCollectionByNameOrId("nw6650ctsgdu1sa")
  return dao.deleteCollection(collection)
})
