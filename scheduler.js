var { Observable, Subscriber, Subscription } = require('./')
var { take } = require('./operators')


class AsyncScheduler {
    constructor(ScheduleAction) {
        this.ScheduleAction = ScheduleAction;
    }

    schedule(work, delay, state) {
        return new this.ScheduleAction(this, work).schedule(state, delay);
    }

    flush(action) {
        var { actions } = this;
        action.execute(action.state, action.delay);
    }
}

class Asynction extends Subscription {
    constructor(scheduler, work) {
        super();
        this.scheduler = scheduler;
        this.work = work;
        this.state;
        this.delay;
        this.id;
    }

    schedule(state, delay) {
        if (this.closed) {
            return this;
        }
        this.state = state;
        var id = this.id;
        var scheduler = this.scheduler;
        if (id !== null) {
            this.id = clearInterval(id);
        }
        this.delay = delay;
        this.id = this.id || setInterval(scheduler.flush.bind(scheduler, this), delay);
        return this;
    }

    execute(state, delay) {
        this.work(state);
    }

    _unsubscribe() {
        this.work = null;
        this.state = null;
        this.scheduler = null;
        this.id = clearInterval(this.id);
        this.delay = null;
    }
}


var async = new AsyncScheduler(Asynction);

function interval(period = 0, scheduler = async) {
    return new Observable(subscriber => {
        subscriber.add(
            scheduler.schedule(function dispatch(state) {
                var { subscriber, counter, period } = state;
                subscriber.next(counter);
                this.schedule({ subscriber, counter: counter + 1, period }, period);
            }, period, { subscriber, counter: 0, period })
        )
        return subscriber;
    })
}

function timer(dueTime, period, scheduler = async) {
    return new Observable(subscriber => {
        return scheduler.schedule(function dispatch(state) {
            var { index, period, subscriber } = state;
            subscriber.next(index);
            if (subscriber.closed){
                return;
            } 
            state.index = index + 1;
            this.schedule(state, period);
        }, dueTime, { index: 0, period, subscriber })
    })
}


exports.interval = interval;
exports.timer = timer;

/**
 * inteval
 */
// interval(200)
//     .pipe(
//         take(3)
//     )
//     .subscribe({
//         next(a) { console.log(a) },
//         complete() { console.log('complete'); }
//     })


/**
 *  timer
 */

// timer(3000, 1000)
//     .pipe(
//         take(3)
//     )
//     .subscribe({
//         next(a) { console.log(a) },
//         complete() { console.log('complete'); }
//     })