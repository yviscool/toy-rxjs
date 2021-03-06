
var { Observable, Subscriber, Subscription } = require('./')
var { interval } = require('./scheduler')
var { take, from, tap } = require('./operators')



class Subject extends Observable {

    constructor() {
        super();

        this.observers = [];
        this.closed = false;
        this.isStopped = false;
        this.hasError = false;
        this.throwError = null;
    }


    next(value) {
        if (!this.isStopped) {
            var { observers } = this;
            var len = observers.length;
            var copy = observers.slice()
            for (let i = 0; i < len; i++) {
                copy[i].next(value)
            }
        }
    }

    // error(err) {
    //     this.hasError = true;
    //     this.throwError = err;
    //     this.isStopped = true;
    //     var { observers } = this;
    //     var len = observers.length;
    //     var copy = observers.slice();
    //     for (let i = 0; i < len; i++) {
    //         copy[i].error(err);
    //     }
    //     this.observers.length = 0;
    // }

    complete() {
        this.isStopped = true;
        var { observers } = this;
        var len = observers.length;
        var copy = observers.slice();
        for (let i = 0; i < len; i++) {
            copy[i].complete();
        }
        this.observers.length = 0;
    }

    unsubscribe() {
        this.isStopped = true;
        this.closed = true;
        this.observers = null;
    }

    // _trySubscribe(subscriber) {
    //     return super._trySubscribe(subscriber);
    // }

    _subscribe(subscriber) {
        if (this.hasError) {
            subscriber.error(this.throwError)
            return new Subscription();
        }
        if (this.isStopped) {
            subscriber.complete();
            return new Subscription();
        }

        this.observers.push(subscriber);
        return new SubjectSubscription(this, subscriber);
    }
}


class SubjectSubscription extends Subscription {
    constructor(subject, subscriber) {
        super();
        this.subject = subject;
        this.subscriber = subscriber;
        this.closed = false;
    }

    unsubscribe() {
        if (this.closed) {
            return;
        }

        this.closed = true;

        var subject = this.subject;
        var observers = subject.observers;

        this.subject = null;

        if (!observers || observers.length === 0 || subject.isStopped || subject.closed) {
            return;
        }

        var subscriberIndex = observers.indexOf(this.subscriber);

        if (subscriberIndex !== -1) {
            observers.splice(subscriberIndex, 1)
        }
    }
}

class ConnectableObservable extends Observable {
    constructor() {
        super();
        this.source = source;
        this.subjectFactory = this.subjectFactory;
        this._subject;
        this._refCount = 0;
        this._connection;

        this._isComplete = false;
    }

    _subscribe(subscriber) {
        return this.getSubject().subscribe(subscriber);
    }

    getSubject() {
        var subject = this._subject;
        if (!subject || subject.isStopped) {
            this._subject = this.subjectFactory();
        }
        return this._subject;
    }

    connect() {
        var connection = this._connection;
        if (!connection) {
            this._compelte = false;
            connection = this._connection = new Subscription();
            connection.add(
                // 这里 subscribe 是通过 source 来订阅的，而不是 通过 _subscribe() 代理的 
                this.source.subscribe(new ConnectableSubscriber(this.getSubject(), this))

                //  正常 connection add 了 一个 ConnectableSubscriber
                // 而 this.source.subscribe 的时候 ConnectableSubscriber 又 add 了上一级的 subscribe/ action 
            )

            if (connection.closed) {
                this._connection = null;
                connection = Subscription.EMPTY;
            } else {
                this._connection = connection;
            }
        }
        return connection;
    }

    refCount(){
        return refCount()(this)
    }
}

class ConnectableSubscriber extends Subscriber {
    constructor(destination, connectable) {
        super(destination);
        this.connectable = connectable;
    }

    // error(err) {
    //     this._unsubscribe();
    //     super.error(err);
    // }

    // compelte() {
    //     this.connectable._isComplete = true;
    //     this._unsubscribe();
    //     super.complete();
    // }

    // _unsubscribe() {
    //     var connectable = this.connectable;
    //     if (connectable) {
    //         this.connectable = null;
    //         var connection = connectable._connection;
    //         connectable._refCount = 0;
    //         connectable._connection = null;
    //         connectable._subject = null;
    //         if (connection) {
    //             connection.unsubscribe();
    //         }
    //     }
    // }
}

function multicast(subjectOrSubjectFactory, selector) {
    return function (source) {
        if (typeof subjectOrSubjectFactory === 'function') {
            var subjectFactory = subjectOrSubjectFactory;
        } else {
            var subjectFactory = () => subjectOrSubjectFactory;
        }
        var connectableProto = ConnectableObservable.prototype;
        var connectable = Object.create(source, {
            // ！！！！ 这里一定要 source 的 operator 替换成 null, 否则会导致 执行多次 operator.call(..);
            operator: { value: null }, 
            _refCount: { value: 0, writable: true },
            _subject: { value: null, writable: true },
            // 重写 _subscribe, 
            _subscribe: { value: connectableProto._subscribe },
            _isComplete: { value: connectableProto._isComplete, writable: true },
            getSubject: { value: connectableProto.getSubject },
            connect: { value: connectableProto.connect },
            refCount: { value: connectableProto.refCount }
        });

        connectable.source = source;
        connectable.subjectFactory = subjectFactory;
        return connectable;
    }
}

function refCount() {
    return function (source) {
        return source.lift(new class {
            constructor() {
                this.connectable = source; 
            }
            call(subscriber, source) {
                var connectable = this.connectable;
                var refCounter = new RefCountSubscriber(subscriber, connectable);
                connectable._refCount++;
                if (!refCounter.closed) {
                    refCounter.connection = connectable.connect();
                }
                return source.subscribe(refCounter)
            }
        })
    }
}

function publish(){
    return multicast(new Subject());
}


function share() {
    return source => refCount()(multicast(new Subject)(source));
  }


class RefCountSubscriber extends Subscriber {
    constructor(destination, connectable) {
        super(destination);
        this.connectable = connectable;
        this.connection;
    }

}



var a = {
    next(v) { console.log(v) },
    compelte() { console.log('a complete'); }
}

var b = {
    next(v) { console.log(v); },
    compelte() { console.log('b complete'); },
}


/**
 *  multicast, connect
 */

var source = interval(1000)
    .pipe(
        tap((x)=>{console.log('tap : ', x);}),
        multicast(new Subject())
    )

// 这里订阅实际上是 通过代理放在 subjct 里面。
var subscriptionA = source.subscribe(a)
var realSubscription = source.connect();
// console.log(realSubscription._subscriptions);

var subscriptionB;
setTimeout(() => {
    subscriptionB = source.subscribe(b)
}, 3000);


setTimeout(() => {
    subscriptionA.unsubscribe();
    subscriptionB.unsubscribe(); 
    // A , B 取消订阅，但 source 还会继续送元素
}, 5000);

setTimeout(() => {
    realSubscription.unsubscribe();
    // 这里 source 才会真正停止送元素
}, 7000);


/**
 *  multicast, refcount
 */

// var source = interval(1000)
//     .pipe(
//         multicast(new Subject()),
//         refCount()
//     )

// or 

// var source = interval(1000)
//     .pipe(
//         multicast(new Subject())  // multicase 返回的 connectable 自带一个 refcount 方法
//     )
//     .refCount();

// source.subscribe(a)

// setTimeout(() => {
//     source.subscribe(b)
// }, 3000);


/**
 *  publish, refcount
 */


// var source = interval(1000)
//     .pipe(
//         publish(),
//         refCount()
//     )

// source.subscribe(a)

// setTimeout(() => {
//     source.subscribe(b)
// }, 3000);


/**
 * share 
 */

// var source = interval(1000)
//     .pipe(
//         share()
//     )

// source.subscribe(a)

// setTimeout(() => {
//     source.subscribe(b)
// }, 3000);