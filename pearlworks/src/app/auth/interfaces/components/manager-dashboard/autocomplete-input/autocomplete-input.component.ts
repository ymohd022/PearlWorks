import {
  Component,
  Input,
  Output,
  EventEmitter,
   OnInit,
   OnDestroy,
   ElementRef,
  ViewChild,
} from "@angular/core"
import { FormControl } from "@angular/forms"
import { Subject } from "rxjs"
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from "rxjs/operators"
import { AutocompleteService, AutocompleteOption } from "../../../services/autocomplete.service"
@Component({
  selector: 'app-autocomplete-input',
  standalone: false,
  templateUrl: './autocomplete-input.component.html',
  styleUrl: './autocomplete-input.component.css'
})
export class AutocompleteInputComponent implements OnInit, OnDestroy {
  @Input() label = ""
  @Input() placeholder = ""
  @Input() searchType:
    | "party-names"
    | "item-details"
    | "model-numbers"
    | "descriptions"
    | "po-numbers"
    | "stone-types" = "party-names"
  @Input() required = false
  @Input() value = ""
  @Output() valueChange = new EventEmitter<string>()
  @Output() selectionChange = new EventEmitter<AutocompleteOption>()

  @ViewChild("inputElement") inputElement!: ElementRef

  inputControl = new FormControl("")
  suggestions: AutocompleteOption[] = []
  showSuggestions = false
  selectedIndex = -1
  private destroy$ = new Subject<void>()

  constructor(private autocompleteService: AutocompleteService) {}

  ngOnInit(): void {
    // Set initial value
    this.inputControl.setValue(this.value)

    // Setup autocomplete search
    this.inputControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.length < 1) {
            this.suggestions = []
            this.showSuggestions = false
            return []
          }
          return this.searchSuggestions(query)
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((suggestions) => {
        this.suggestions = suggestions
        this.showSuggestions = suggestions.length > 0
        this.selectedIndex = -1
      })

    // Emit value changes
    this.inputControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.valueChange.emit(value || "")
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private searchSuggestions(query: string) {
    switch (this.searchType) {
      case "party-names":
        return this.autocompleteService.searchPartyNames(query)
      case "item-details":
        return this.autocompleteService.searchItemDetails(query)
      case "model-numbers":
        return this.autocompleteService.searchModelNumbers(query)
      case "descriptions":
        return this.autocompleteService.searchDescriptions(query)
      case "po-numbers":
        return this.autocompleteService.searchPoNumbers(query)
      case "stone-types":
        return this.autocompleteService.searchStoneTypes(query)
      default:
        return this.autocompleteService.searchPartyNames(query)
    }
  }

  onFocus(): void {
    if (this.suggestions.length > 0) {
      this.showSuggestions = true
    }
  }

  onBlur(): void {
    // Delay hiding to allow click events
    setTimeout(() => {
      this.showSuggestions = false
      this.selectedIndex = -1
    }, 200)
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!this.showSuggestions || this.suggestions.length === 0) return

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1)
        break
      case "ArrowUp":
        event.preventDefault()
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1)
        break
      case "Enter":
        event.preventDefault()
        if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
          this.selectSuggestion(this.suggestions[this.selectedIndex])
        }
        break
      case "Escape":
        this.showSuggestions = false
        this.selectedIndex = -1
        break
    }
  }

  selectSuggestion(suggestion: AutocompleteOption): void {
    this.inputControl.setValue(suggestion.value)
    this.showSuggestions = false
    this.selectedIndex = -1
    this.selectionChange.emit(suggestion)
    this.inputElement.nativeElement.blur()
  }
}
