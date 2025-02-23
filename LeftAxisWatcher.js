export default class LeftAxisWatcher extends EventTarget {
    constructor() {
        super();
        this._value = 0;
    }

    set value( newValue ) {
        this._value = newValue;
        this.dispatchEvent(new Event( "leftAxisChange" ));
    }

    get value() {
        return this._value;
    }
}