import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  private apiKey = new BehaviorSubject<string | null>(null);

  constructor() {}

  getApiKey() {
    return this.apiKey.asObservable();
  }

  setApiKey(key: string) {
    this.apiKey.next(key);
  }
}
