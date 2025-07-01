import { Injectable } from "@angular/core"
import {  HttpClient, HttpHeaders } from "@angular/common/http"
import  { Observable } from "rxjs"
import { map } from "rxjs/operators"
import { environment } from "../../../environments/environment"

export interface AutocompleteOption {
  value: string
  count: number
}

export interface AutocompleteResponse {
  success: boolean
  data: AutocompleteOption[]
}

@Injectable({
  providedIn: "root",
})
export class AutocompleteService {
  private apiUrl = environment.apiUrl

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem("auth_token")
    return new HttpHeaders({
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    })
  }

  searchPartyNames(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/party-names`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }

  searchItemDetails(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/item-details`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }

  searchModelNumbers(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/model-numbers`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }

  searchDescriptions(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/descriptions`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }

  searchPoNumbers(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/po-numbers`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }

  searchStoneTypes(query: string): Observable<AutocompleteOption[]> {
    return this.http
      .get<AutocompleteResponse>(`${this.apiUrl}/autocomplete/stone-types`, {
        headers: this.getHeaders(),
        params: { q: query },
      })
      .pipe(map((response) => response.data || []))
  }
}
