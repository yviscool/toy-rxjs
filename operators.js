var {
    Observable,
    Subscriber
} = require('./')

function map(fnc) {
    return source =>
        // sourc above observable
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new MapSubscriber(subscriber, fnc));
            }
        })
}

function tap(fnc) {
    return source =>
        // sourc above observable
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new TapSubscriber(subscriber, fnc));
            }
        })
}

function skip(count) {
    return source =>
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new SkipSubscriber(subscriber, count));
            }
        })
}

function take(count) {
    return source =>
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new TakeSubscriber(subscriber, count));
            }
        })
}

function takeUntil(notifier) {
    return source =>
        source.lift(new class {
            call(subscriber, source) {
                var takeUnitlSubscriber = new TakeUntilSubscriber(subscriber);
                var notifierSubscription = notifier.subscribe(new class extends Subscriber {
                    constructor(parent) {
                        super();
                        this.parent = takeUnitlSubscriber;
                    }
                    next(v) {
                        this.parent.notifyNext();
                    }
                    complete() {
                        // this.parent.notifyComplete();
                        this.unsubscribe();
                    }
                })
                if (notifierSubscription && !notifierSubscription.closed) {
                    takeUnitlSubscriber.add(notifierSubscription)
                    return source.subscribe(takeUnitlSubscriber);
                }
                return takeUnitlSubscriber;
            }
        })
}

function takeWhile(predicate) {
    return source =>
        source.lift(new class {
            call(subscriber, source) {
                return source.subscribe(new TakeWhileSubscriber(subscriber, predicate))
            }
        })
}


function buffer(closingNotifier) {
    return source => source.lift(new class {
        call(subscriber, source) {
            return source.subscribe(new BufferSubscriber(subscriber, closingNotifier))
        }
    });
}

function bufferCount(bufferSize){
    return source => 
            source.lift(new class {
                call(subscriber, source){
                    return source.subscribe(new BufferCountSubscriber(subscriber, bufferSize))
                }
            })
}

function concatAll() {
    return mergeAll(1)
}

function mergeAll(concurrent = Number.POSITIVE_INFINITY) {
    return mergeMap(function(value) {
        return value;
    }, concurrent)
}

function concatMap(project) {
    return mergeMap(project, 1)
}

function mergeMap(project, concurrent = Number.POSITIVE_INFINITY) {
    return source =>
        source.lift(new class {
            call(observer, source) {
                return source.subscribe(new MergeMapSubscriber(observer, project, concurrent))
            }
        })
}


class MapSubscriber extends Subscriber {
    constructor(destination, fnc) {
        super(destination);
        this.fnc = fnc;
    }
    next(value) {
        var result = this.fnc.call(null, value)
        this.destination.next(result);
    }
}

class TapSubscriber extends Subscriber {
    constructor(destination, fnc) {
        super(destination);
        this.fnc = fnc;
    }
    next(value) {
        var result = this.fnc.call(null, value)
        this.destination.next(value);
    }

    complete() {
        return this.destination.complete();
    }
}

class SkipSubscriber extends Subscriber {
    constructor(destination, total) {
        super(destination);
        this.total = total;
        this.count = 0;
    }
    next(value) {

        if (++this.count > this.total) {
            this.destination.next(value);
        }
    }
}


class TakeSubscriber extends Subscriber {
    constructor(destination, total) {
        super(destination);
        this.total = total;
        this.count = 0;
    }
    next(value) {
        var total = this.total;
        var count = ++this.count;
        if (count <= total) {
            this.destination.next(value);
            if (count === total) {
                this.destination.complete();
                this.unsubscribe();
            }
        }
    }
}


class TakeUntilSubscriber extends Subscriber {
    constructor(destination) {
        super(destination)
    }
    notifyNext() {
        this.complete();
    }
    notifyComplete() {}
}



class TakeWhileSubscriber extends Subscriber {
    constructor(destination, predicate) {
        super(destination)
        this.predicate = predicate;
        // this.index = 0;
    }
    next(v) {
        var result = this.predicate(v, /**this.index++**/ )
        this.nextOrComplete(v, result)
    }

    nextOrComplete(v, result) {
        var destination = this.destination;
        if (Boolean(result)) {
            destination.next(v)
        } else {
            destination.complete()
        }
    }
}


class MergeMapSubscriber extends Subscriber {
    constructor(destination, project, concurrent) {
        super(destination);
        this.project = project;
        this.concurrent = concurrent;

        this.active = 0;
        this.index = 0;
        this.buffer = [];
        this.hasCompleted = false;
    }

    next(value) {
        if (this.active < this.concurrent) {
            this._tryNext(value);
        } else {
            this.buffer.push(value);
        }
    }

    complete() {
        this.hasCompleted = true;
        if (this.active === 0 && this.buffer.length === 0) {
            this.destination.complete();
        }
    }

    _tryNext(value) {
        var index = this.index++;
        var result = this.project(value, index);
        var ctx = this;
        this.active++;
        result.subscribe(new class extends Subscriber {
            constructor() {
                super();
                //这里是 parent
                this.parent = ctx;
                this.index = 0;

                this.outerValue = value;
                this.outerIndex = index;
            }
            next(value) {
                this.parent.notifyNext(this.outerValue, value, this.outerIndex, this.index++, this);
            }
            complete() {
                this.parent.notifyComplete(this);
                this.unsubscribe();
            }
        })
    }

    notifyNext(outerValue, innerValue, outerIndex, innerIndex, innerSub) {
        this.destination.next(innerValue);
    }

    notifyComplete(innerSub) {
        const buffer = this.buffer;
        this.active--;
        if (buffer.length > 0) {
            this.next(buffer.shift());
        } else if (this.active === 0 && this.hasCompleted) {
            this.destination.complete()
        }
    }
}

// 跟 mergeMap 有点像
class BufferSubscriber extends Subscriber {
    constructor(destination, closingNotifier) {
        super(destination);
        this.buffer = [];
        var ctx = this;
        this.add(closingNotifier.subscribe(new class extends Subscriber {
            constructor() {
                super();
                //这里是 parent
                this.parent = ctx;
            }
            next(value) {
                this.parent.notifyNext();
            }
            complete() {
                this.parent.notifyComplete(this);
                this.unsubscribe();
            }
        }))
    }

    next(v){
        this.buffer.push(v);
    }

    notifyNext(){
        var buffer = this.buffer;
        this.buffer = [];;
        this.destination.next(buffer)
    }

    notifyComplete() {
        this.destination.complete();
    }
}

class BufferCountSubscriber extends Subscriber{

    constructor(destination, bufferSize){
        super(destination)
        this.bufferSize = bufferSize;
        this.buffer = [];
    }

    next(value){
        var buffer = this.buffer;
        buffer.push(value)

        if (buffer.length === this.bufferSize){
            this.destination.next(buffer);
            this.buffer = [];
        }
    }
}

function from(input) {
    if (input instanceof Observable) {
        return input;
    }

    if (input.then && input.catch) {
        return new Observable((subscriber) => {
            input
                .then(value => {
                    subscriber.next(value),
                        subscriber.complete();
                })
                .catch(subscriber.error)
        })
    }

    if (input.length && input.slice && input.find) {
        return new Observable((subscriber) => {
            input.forEach(v => {
                subscriber.next(v)
            })
            subscriber.complete()
        })
    }
}

function defer(observableFactory) {
    return new Observable(subscriber => {
        var input = observableFactory()
        var source = input ?
            from(input) :
            new Observable(subscriber => subscriber.complete())
        return source.subscribe(subscriber)
    })
}

function merge(...observables) {
    return mergeAll(Number.POSITIVE_INFINITY)(new Observable(subscriber => {
        observables.forEach(v => {
            subscriber.next(v)
        })
        subscriber.complete()
    }));
}

function concat(...observables) {
    return concatAll()(new Observable(subscriber => {
        observables.forEach(v => {
            subscriber.next(v)
        })
        subscriber.complete()
    }));
}


exports.defer = defer;
exports.from = from;
exports.merge = merge;
exports.concat = concat;

exports.tap = tap;
exports.take = take;
exports.map = map;
exports.skip = skip;
exports.concatAll = concatAll;
exports.concatMap = concatMap;
exports.mergeMap = mergeMap;
exports.mergeAll = mergeAll;

// defer(() => Observable.create(subscriber => {
//         subscriber.next(1)
//         subscriber.next(3)
//         subscriber.complete()
//     }))
// .toPromise()
// .then(console.log)
// .catch(console.log)

// from([1, 2, 3, 4])
//     .pipe(
//         // tap(x => { }),
//         //concatMap(x => from([x, 1]).pipe(take(1)))
//         mergeMap(x => from([x, 1]).pipe(take(1)))
//         // filter(x => x > 2),
//         // map(x => x + 1)
//     )
//     .subscribe({
//         next(x) { console.log(x) },
//         complete() { },
//     })


/**
 *  mergeMap, concatMap
 */
// from([1, 2, 3, 4])
//     .pipe(
//         //concatMap(x => from([x, 1]).pipe(take(1)))
//         mergeMap(x => from([x, 1]).pipe(take(1)))
//     )
//     .subscribe({
//         next(x) { console.log(x) },
//         complete() { },
//     })


/**
 *  concatAll, mergeAll
 */
// from([from([1]), from([2])])
//     .pipe(
//         concatAll(),
//     // mergeAll(),
// )
//     .subscribe({
//         next(x) { console.log(x) },
//         complete() { },
//     })


/**
 *  concat, merge
 */
// merge(
//     from([1, 2, 3]).pipe(take(2)),
//     from([4, 5, 6]).pipe(take(3))
// )
// concat(
//     from([1, 2, 3]).pipe(take(2)),
//     from([4, 5, 6]).pipe(take(3))
// )
//     .subscribe({
//         next(x) { console.log(x) },
//         complete() { },
//     })

// 等同于
// from([1,2,3]).pipe(take(2)).subscrie(new InnerSubscriber{
//
//})


/**
 *  takeUntil
 */

// var { interval } = require('./scheduler');

// interval(1000)
//     .pipe(
//         takeUntil(interval(3000))
//     )
//     .subscribe({
//         next(x) { console.log(x); },
//         complete() { }
//     })


/**
 * takeWhile
 */

// interval(1000)
//     .pipe(
//         takeWhile(v => v < 3)
//     )
//     .subscribe({
//         next(x) { console.log(x); },
//         complete() { } 
//     })



/** 
 * buffer
 */

// expect 
// [ 0, 1, 2 ]
// [ 3, 4, 5 ]
// [ 6, 7, 8 ]
// [ 9, 10, 11, 12 ]


// var { interval } = require('./scheduler');
// var source = interval(300);
// var source2 = interval(1000);
// var example = source.pipe(buffer(source2))

// example.subscribe({
//     next: (value) => { console.log(value); },
//     error: (err) => { console.log('Error: ' + err); },
//     complete: () => { console.log('complete'); }
// });


/**
 * bufferCount
 */

// expect
// [ 0, 1 ]
// [ 2, 3 ]
// [ 4, 5 ]
// [ 6, 7 ]

// var source = interval(300);
// var example = source.pipe(bufferCount(2))

// example.subscribe({
//     next: (value) => { console.log(value); },
//     error: (err) => { console.log('Error: ' + err); },
//     complete: () => { console.log('complete'); }
// });
