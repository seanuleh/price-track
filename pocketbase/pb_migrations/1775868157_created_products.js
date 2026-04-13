/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  const collection = new Collection({
    "id": "lgrm272zrta0icu",
    "name": "products",
    "type": "base",
    "system": false,
    "schema": [
      {"system":false,"id":"3n9mv5pe","name":"name","type":"text","required":true,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"zqjd1feb","name":"url","type":"url","required":false,"presentable":false,"unique":false,"options":{"exceptDomains":null,"onlyDomains":null}},
      {"system":false,"id":"63dld1nw","name":"image_url","type":"url","required":false,"presentable":false,"unique":false,"options":{"exceptDomains":null,"onlyDomains":null}},
      {"system":false,"id":"ewmapixq","name":"description","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"enbfmwfu","name":"brand","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"jlntnukt","name":"model","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"04ldbew7","name":"category","type":"text","required":false,"presentable":false,"unique":false,"options":{"min":null,"max":null,"pattern":""}},
      {"system":false,"id":"lxgfjkqy","name":"user","type":"relation","required":false,"presentable":false,"unique":false,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"minSelect":null,"maxSelect":1,"displayFields":null}}
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
  const collection = dao.findCollectionByNameOrId("lgrm272zrta0icu")
  return dao.deleteCollection(collection)
})
