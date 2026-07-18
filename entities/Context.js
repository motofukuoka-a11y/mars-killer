/**
 * Context
 * 現在の営業実務コンテキスト
 */

export default class Context {

    constructor(){

        this.station = null;

        this.businessDate = new Date();

        this.applicationDate = new Date();

        this.user = "";

        this.workspace = "default";

    }

}