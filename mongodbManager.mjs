/**
 * Centralization of the operations to Mongo DB
 */

import { MongoClient } from 'mongodb'

class MongoDBManager {
  /**
     * default constructor
     */
  constructor () {
    this.dbName = ''
    this.dbPort = ''
    this.dbUser = ''
    this.dbPassword = ''
    this.stationsCollection = 'chirpstack-stations'
    this.observationsCollection = 'chirpstack-observations'
    this._mongoUri = ''
  }

  /**
     * Must be called to initialize the module
    * @param {string} dbHost
    * @param {string} dbName
     * @param {string} dbPort
     * @param {string} dbUser
     * @param {string} dbPassword
     */
  setDBInfo (dbHost, dbName, dbPort, dbUser, dbPassword) {
    this.dbHost = dbHost
    this.dbName = dbName
    this.dbPort = dbPort
    this.dbUser = dbUser
    this.dbPassword = dbPassword
    this._mongoURI = `mongodb://${this.dbUser}:${this.dbPassword}@${this.dbHost}:${this.dbPort}/${this.dbName}`
  }

  /**
     * Clean the observations collection; usefull when updating the model
     * @param {string} collectionName collection to delete
     */
  async deleteCollection (collectionName) {
    const client = new MongoClient(this._mongoURI)

    try {
      await client.connect()
      const db = client.db(this.dbName)
      const collection = db.collection(collectionName)

      // delete all objects
      const result = await collection.deleteMany({})
      console.log(`Delete ${result.deletedCount} items from ${collectionName}.`)
    } catch (error) {
      console.error(`Error cleaning collection ${collectionName}: ${error}`)
    } finally {
      await client.close()
    }
  }

  /**
     * Insert object into mongoDB
     * @param {geojson features} array of geojson features
     */
  async insertGeoJSONFeatures (features) {
    const client = new MongoClient(this._mongoURI)

    try {
      await client.connect()
      console.log(`Connected to MongoDB ${this.dbName}`)
      const db = client.db(this.dbName)
      const collection = db.collection(this.observationsCollection)

      for (const feature of features) {
        await collection.insertOne(feature)
      }
      console.log(`GeoJSON inserted successfully into ${this.observationsCollection}`)
    } catch (error) {
      console.error('Error inserting GeoJSON:', error)
    } finally {
      await client.close()
      console.log('MongoDB connection closed')
    }
  }

  /**
     * Given the list of the stations write it in the stations collections
     * @param {object} gateways list of stations to write
     *
     */
  async syncStations (gateways) {
    const client = new MongoClient(this._mongoURI)

    try {
      for (const gatewayId in gateways) {
        await client.connect()
        const db = client.db(this.dbName)
        const collection = db.collection(this.stationsCollection)
        // check if stations exists
        const result = await collection.findOne({ 'properties.euid': gatewayId })
        if (!result) {
          const geoJson = {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [gateways[gatewayId].lon, gateways[gatewayId].lat]
            },
            properties: {
              euid: gatewayId,
              gw_euid: gatewayId,
              name: gateways[gatewayId].desc
            }
          }
          await collection.insertOne(geoJson)
          console.log(`Gateway (${gatewayId}) inserted successfully into ${this.stationsCollection}`)
        }
      }
    } catch (error) {
      console.error(`Error adding gateway in collection ${this.stationsCollection}: ${error}`)
    } finally {
      await client.close()
    }
  }
}

const mongoDBManager = new MongoDBManager()
export default mongoDBManager
