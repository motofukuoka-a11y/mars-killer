/**
 * MasterLoader
 */

export default class MasterLoader{

    static async loadJson(path){

        const response = await fetch(path);

        if(!response.ok){

            throw new Error(`読込失敗 : ${path}`);

        }

        return await response.json();

    }

}