import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EmitterService<T> {
  @Inject()
  protected emitter2: EventEmitter2;

  emitAsync<key extends string & keyof T>(eventType: key, eventValue: T[key]) {
    return this.emitter2.emitAsync(eventType, eventValue, eventType);
  }

  emit<key extends string & keyof T>(eventType: key, eventValue: T[key]) {
    return this.emitter2.emit(eventType, eventValue, eventType);
  }
}
