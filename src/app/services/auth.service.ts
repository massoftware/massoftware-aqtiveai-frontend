import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

export interface UserInfo {
  sub: string;
  given_name: string;
  roles: string;
  email: string;
  employee_id: string;
  employee_name: string;
  employee_nik: string;
  manager_id: string;
  area_code: string;
  division_code: string;
  job_title_code: string;
  area_name: string;
  division_name: string;
  job_title_name: string;
  image_path: string;
  image_real_path: string;
  company_code: string;
  company_name: string;
  user_id: string;
  backendUrl: string;
  frontendUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_INFO_KEY = 'user_info';

  constructor(private router: Router) {}

  public initializeAuth(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      this.setToken(token);
      const userInfo = this.decodeToken(token);
      if (userInfo) {
        this.setUserInfo(userInfo);
      }

      // Clean URL by removing token parameter
      this.cleanUrl();
    }
  }

  public setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  public getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  public setUserInfo(userInfo: UserInfo): void {
    localStorage.setItem(this.USER_INFO_KEY, JSON.stringify(userInfo));
  }

  public getUserInfo(): UserInfo | null {
    const userInfoStr = localStorage.getItem(this.USER_INFO_KEY);
    return userInfoStr ? JSON.parse(userInfoStr) : null;
  }

  public getUserName(): string {
    const userInfo = this.getUserInfo();
    return userInfo?.given_name || userInfo?.employee_name || 'User';
  }


  public isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = this.decodeToken(token);
      if (!payload) return false;

      // Check if token is expired
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  }

  public logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_INFO_KEY);
  }

  private decodeToken(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      console.error('Failed to decode token');
      return null;
    }
  }

  private cleanUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, url.toString());
  }
}