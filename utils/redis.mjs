import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
    constructor() {
        this.client = createClient();

        // Afficher les erreurs de connexion dans la console
        this.client.on('error', (err) => {
            console.error(`Redis client error: ${err.message}`);
        });
    }

    /**
     * Vérifie si la connexion à Redis est active
     * @returns {boolean} true si connecté, sinon false
     */
    isAlive() {
        // La version 2.8.0 de 'redis' possède une propriété 'connected'
        return this.client.connected;
    }

    /**
     * Récupère la valeur associée à une clé dans Redis
     * @param {string} key - La clé à chercher
     * @returns {Promise<string|null>} La valeur de la clé
     */
    async get(key) {
        const getAsync = promisify(this.client.get).bind(this.client);
        return getAsync(key);
    }

    /**
     * Stocke une valeur avec un temps d'expiration
     * @param {string} key - La clé
     * @param {string|number} value - La valeur à stocker
     * @param {number} duration - Le temps d'expiration en secondes
     * @returns {Promise<void>}
     */
    async set(key, value, duration) {
        // setex permet de définir une clé avec une expiration en secondes
        const setexAsync = promisify(this.client.setex).bind(this.client);
        return setexAsync(key, duration, value);
    }

    /**
     * Supprime une clé de Redis
     * @param {string} key - La clé à supprimer
     * @returns {Promise<void>}
     */
    async del(key) {
        const delAsync = promisify(this.client.del).bind(this.client);
        return delAsync(key);
    }
}

// Créer et exporter l'instance
const redisClient = new RedisClient();
export default redisClient;