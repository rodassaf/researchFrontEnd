export default class RightAxisWatcher extends EventTarget {
    constructor() {
        super();
        this._value = 0;
    }

    set value( newValue ) {
        this._value = newValue;
        this.dispatchEvent(new Event( "rightAxisChange" ));
    }

    get value() {
        return this._value;
    }
}