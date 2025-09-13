import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  private hardcodedApiKey = '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';
  private apiKey = new BehaviorSubject<string | null>(this.hardcodedApiKey);

  constructor() {}

  getApiKey() {
    return this.apiKey.asObservable();
  }

  setApiKey() {
    this.apiKey.next(this.hardcodedApiKey);
  }
}
