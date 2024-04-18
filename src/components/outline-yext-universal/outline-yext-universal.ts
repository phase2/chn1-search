import { LitElement, html, noChange, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
// import { ifDefined } from 'lit/directives/if-defined.js';
import { classMap } from 'lit/directives/class-map.js';
import componentStyles from './outline-yext-universal.css?inline';

import { Task } from '@lit/task';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ResizeController } from '../../controllers/resize-controller';
import { AdoptedStyleSheets } from '../../controllers/adopted-stylesheets.ts';
// import { debounce } from '../../utilities/debounce';
import { displayTeaser } from '../outline-yext-vertical/teaser';

import type {
  SearchSettings,
  Result,
  UniversalSearchResponse,
  // ResponseSearchSuggestions,
  Module,
} from '../../libraries/data/yext-types';

import '../outline-yext-vertical/outline-yext-vertical';
import {
  defaultSearchSettings,
  getStoredSearchSettings,
  getYextSearchData,
  isVerticalSearchResponse,
  setStoredSearchSettings,
  syncSearchSettingsInStore,
} from '../../libraries/data/data-yext';
import Pending from '../../libraries/ui/pending';

/**
 * The Yext Universal Search component.
 * @element outline-yext-universal
 */

@customElement('outline-yext-universal')
export class OutlineYextUniversal extends LitElement {
  adoptedStyleSheets = new AdoptedStyleSheets(this, {
    // globalCSS: globalStyles,
    encapsulatedCSS: componentStyles,
  });

  pageTitle = '';

  searchSettings: SearchSettings | undefined;

  // @property()
  totalCount!: null | number;
  randomizationToken!: null | string;

  filterTempProfiles = false;

  @property({ type: Boolean, reflect: true, attribute: 'debug' })
  debug: boolean | undefined;

  @property({ type: Number, reflect: true, attribute: 'show-results' })
  showResults = 5;

  userLat!: number;
  userLong!: number;

  @state()
  activeVertical: string = 'all';

  verticalKey = 'all';

  @state() isFocus = false;

  @state()
  entities!: [];

  @state()
  searchSuggestions: Result[] = [];

  @state() modalFiltersOpenClose = false;
  @state() dropdownVerticalsOpen = false;

  @state() searchFacetValues!: {
    [key: string]: string;
  };

  taskValue: unknown;

  connectedCallback() {
    super.connectedCallback();
    this.initializeSearchSettings();
    this.displayResults =
      this.searchSettings !== undefined && this.searchSettings.input !== '';
  }

  initializeSearchSettings() {
    syncSearchSettingsInStore();
    this.searchSettings = {
      ...getStoredSearchSettings(),
      activeVertical: 'all', //@todo are we using this anywhere?
      limit: null,
    };
    setStoredSearchSettings(this.searchSettings);
  }

  /**
   * Handles a page change event, updating the data offset and triggering data retrieval.
   *
   * This function is typically used in pagination systems to respond to a page change event.
   * It calculates the data offset based on the clicked page number and updates the offset
   * in the search settings. Then, it triggers a data retrieval action, such as an API call.
   *
   * @param {Event} event - The page change event, typically a click event.
   */
  handlePageChange(event: Event) {
    if (!this.searchSettings) {
      return;
    }

    const pageClicked = (event.target as HTMLElement).getAttribute(
      'current-page'
    );

    // Check if pageClicked is not null and is a valid number
    if (pageClicked !== null && !isNaN(Number(pageClicked))) {
      const offset = (Number(pageClicked) - 1) * (this.searchSettings.limit ?? 0);
      this.searchSettings.offset = offset;
      this.fetchEndpoint.run();
    }
  }

  resizeController = new ResizeController(this, {});

  rawFilters: {} | undefined;

  fetchEndpoint = new Task(
    this,
    async () => getYextSearchData({ verticalKey: this.verticalKey }),
    () => [this.entities]
  );

  /**
   * Renders the entire results list.
   * @param {UniversalSearchResponse} response - The search response object.
   * @returns {TemplateResult} - The rendered results list.
   */
  private displayAll(response: UniversalSearchResponse): TemplateResult {
    if (response.modules?.length === 0) {
      return this.renderNoResultsFound();
    }

    return html`
      <div class="results-list">
        ${repeat(
          response.modules,
          (module: Module) => module,
          module => this.renderResultsSection(module)
        )}
      </div>
    `;
  }

  /**
   * Renders a "No results found" message.
   * @returns {TemplateResult} - The rendered message.
   */
  private renderNoResultsFound(): TemplateResult {
    return html`<div class="no-results-message">
      <h2 class="no-results-heading">Sorry, we couldn’t find anything</h2>
      <div class="no-results-copy">
        <p>
          We couldn't find any matches for your search. Try checking your
          spelling, refining your search terms, using synonyms, or expanding
          your search criteria.
        </p>

        <p>If you need assistance, please call 800-777-7775.</p>
      </div>
    </div>`;
  }

  /**
   * Renders a section of results.
   * @param {Module} module - The module containing results to render.
   * @returns {TemplateResult} - The rendered results section.
   */
  private renderResultsSection(module: Module): TemplateResult {
    return html`
      <div class="results-section">
        <div class="results-section-heading">
          <h2 class="results-section-type">

              ${this.setVerticalTitle(module.verticalConfigId)}
          </h2>
          <button
            class=""
            @click="${() => this.setActiveVertical(module.verticalConfigId)}"
          >
            View All
          </button>
        </div>
        <ul class="results">
          ${repeat(
            module.results.slice(0, 3),
            result => result,
            // (result, index) => this.renderResultItem(module.verticalConfigId, result, index)
            (result, _index) => {
              return html` <li class="result">
                ${displayTeaser(module.verticalConfigId, result)}
              </li>`;
            }
          )}
        </div>
      </div>
    `;
  }

  sumResultsCount(searchResponse: UniversalSearchResponse): number {
    const { modules } = searchResponse;

    const totalResultsCount = modules.reduce(
      (sum, { resultsCount }) => sum + resultsCount,
      0
    );

    return totalResultsCount;
  }

  reset(e: Event) {
    e.preventDefault(); // prevent form submission
    this.searchSettings = structuredClone(defaultSearchSettings);
    setStoredSearchSettings(this.searchSettings);
    this.cleanSearchSuggestions();
    this.fetchEndpoint.run();
  }

  cleanSearchSuggestions() {
    this.searchSuggestions = [];
    this.isFocus = false;
  }

  displayResults: boolean = false;

  search(e: Event) {
    // prevent form submission
    e.preventDefault();
    this.cleanSearchSuggestions();

    if (!this.searchSettings) {
      return;
    }

    // save input before resetting searchSettings and then restore it back
    const inputSearch = this.searchSettings.input;
    this.searchSettings = structuredClone(defaultSearchSettings);
    this.searchSettings.input = inputSearch;
    setStoredSearchSettings(this.searchSettings);

    this.activeVertical = 'all';
    this.displayResults = this.searchSettings.input !== '';
    this.fetchEndpoint.run();
  }

  // Single instance was created outside of the handleInput so that the debounce is not called multiple times
  // debouncedFunction = debounce(this.fetchSuggestion.bind(this), 150);

  handleInput(e: InputEvent) {
    e.preventDefault;

    if (!this.searchSettings) {
      return;
    }

    this.searchSettings.input = (e.target as HTMLInputElement).value;
    if (this.searchSettings.input.length > 3) {
      // this.debouncedFunction();
      // @todo get suggestions.
    } else {
      this.cleanSearchSuggestions();
    }
  }

  _focusIn() {
    if (!this.searchSettings) {
      return;
    }

    if (
      this.searchSettings.input.length > 3 &&
      this.searchSuggestions.length > 0
    ) {
      this.isFocus = true;
    }
  }

  _focusOut(e: FocusEvent) {
    const currentTarget = e.currentTarget as Node;
    const relatedTarget = e.relatedTarget as Node;
    if (relatedTarget === null) {
      this.isFocus = false;
    }

    if (!!relatedTarget && !currentTarget.contains(relatedTarget)) {
      this.isFocus = false;
    }
  }

  searchFormTemplate(): TemplateResult {
    if (!this.searchSettings) {
      return html``;
    }

    const breakpointClass =
      this.resizeController.currentBreakpointRange === 0
        ? 'is-mobile'
        : 'is-desktop';

    return html`
      <div class="search-form ${breakpointClass}">
        <div
          class="search-form__inner"
          @focusout="${(e: FocusEvent) => this._focusOut(e)}"
        >
          <form
            action="/search"
            method="get"
            id="views-exposed-form-search-search-page"
            accept-charset="UTF-8"
            class="${breakpointClass}"
          >
            <div
              class="js-form-item form-item js-form-type-textfield form-item-text js-form-item-text"
            >
              <label
                for="edit-search-api-fulltext"
                class="sr-only form-item__label"
                >Keyword</label
              >
              <input
                placeholder=""
                type="text"
                id="edit-search-api-fulltext"
                name="field_keyword"
                .value=${this.searchSettings.input}
                @input=${this.handleInput}
                @focus="${this._focusIn}"
                maxlength="128"
                class="form-text form-element form-element--type-text form-element--api-textfield"
              />
            </div>
            <div
              data-drupal-selector="edit-actions"
              class="form-actions js-form-wrapper form-wrapper"
            >
              <button
                class="btn btn--search form-submit"
                data-drupal-selector="edit-submit"
                type="submit"
                id="edit-submit"
                value="Search"
                @click=${(e: Event) => this.search(e)}
              >
                <span>Search</span>
              </button>
            </div>
          </form>

          <ul
            aria-live="polite"
            class="${this.isFocus
              ? 'open-suggestion'
              : 'close-suggestion'} suggested-list"
          >
            <!-- <li class="suggested-title">Suggested Searches</li> -->
            ${this.searchSuggestions.length > 0
              ? this.searchSuggestions.map(
                  suggestion =>
                    html`<li>
                      <button
                        type="button"
                        @click="${() => this.handleSuggestion(suggestion)}"
                      >
                        ${unsafeHTML(
                          this.highlightWord(
                            suggestion.value,
                            this.searchSettings?.input ?? ''
                          )
                        )}
                      </button>
                    </li> `
                )
              : undefined}
          </ul>
        </div>
      </div>
    `;
  }

  highlightWord(string: string, words: string) {
    const regex = new RegExp(words, 'gi');
    return string.replace(regex, function (str) {
      return '<span class="suggestion-highlight">' + str + '</span>';
    });
  }

  handleSuggestion(suggestion: Result) {
    if (!this.searchSettings) {
      return;
    }

    this.searchSettings.input = suggestion.value;
    this.fetchEndpoint.run();
    this.cleanSearchSuggestions();
  }

  setActiveVertical(vertical: string) {
    if (!this.searchSettings) {
      return;
    }

    this.activeVertical = vertical;

    if (vertical !== 'all') {
      this.shadowRoot
        ?.querySelector('outline-yext-vertical')
        ?.setAttribute('vertical-key', this.activeVertical);
    }

    this.dropdownVerticalsOpen = false;

    this.searchSettings = {
      ...this.searchSettings,
      input: this.searchSettings.input,
      activeVertical: vertical,
    };
    setStoredSearchSettings(this.searchSettings);

    this.shadowRoot
      ?.querySelector('outline-yext-vertical')
      ?.fetchEndpoint.run();
  }

  setVerticalTitle(title: string): TemplateResult {
    return html`
      ${title === 'locationsearch'
        ? 'Location'
        : title
            .replace(/_/g, ' ')
            .replace(/\b\w/g, match => match.toUpperCase())}
    `;
  }

  mobileVerticalNavTemplate(response: UniversalSearchResponse): TemplateResult {
    return html`
      ${response.modules.length !== 0
        ? html`
            <div class="vertical-nav is-mobile">
              <h2 class="vertical-nav__heading is-mobile">
                Refine Your Search
              </h2>

              <div class="vertical-nav__dropdown">
                <button
                  class="vertical-nav__dropdown-button ${this
                    .dropdownVerticalsOpen
                    ? 'is-open'
                    : ''}"
                  aria-expanded="${this.dropdownVerticalsOpen}"
                  aria-label="Select content type"
                  aria-controls="vertical-dropdown-content"
                  @click=${() =>
                    (this.dropdownVerticalsOpen = !this.dropdownVerticalsOpen)}
                >
                  ${this.setVerticalTitle(this.activeVertical)}
                </button>
                <div
                  id="vertical-dropdown-content"
                  class="vertical-nav__dropdown-wrapper ${this
                    .dropdownVerticalsOpen
                    ? 'is-open'
                    : ''}"
                >
                  <ul class="vertical-nav__list mobile">
                    <li
                      class=" ${this.activeVertical == 'all' ? 'active' : ''}"
                    >
                      <button
                        @click="${() => this.setActiveVertical('all')}"
                        class="vertical-nav__item"
                      >
                        All
                      </button>
                    </li>
                    ${repeat(
                      response.modules,
                      (result: Module) => result,
                      (result, index) => html`
                        <li
                          data-index=${index}
                          class=" ${this.activeVertical ===
                          result.verticalConfigId
                            ? 'active'
                            : ''}"
                        >
                          <button
                            class="vertical-nav__item"
                            @click="${() =>
                              this.setActiveVertical(result.verticalConfigId)}"
                          >
                            ${this.setVerticalTitle(result.verticalConfigId)}
                          </button>
                        </li>
                      `
                    )}
                  </ul>
                </div>
              </div>
            </div>
          `
        : ``}
    `;
  }

  desktopVerticalNavTemplate(
    response: UniversalSearchResponse
  ): TemplateResult {
    return html`
      ${response.modules?.length !== 0
        ? html`
            <div class="vertical-nav is-desktop">
              <h2 class="vertical-nav__heading is-desktop">
                Refine Your Search
              </h2>

              <ul class="vertical-nav__list is-desktop">
                <li class=" ${this.activeVertical == 'all' ? 'active' : ''}">
                  <button @click="${() => this.setActiveVertical('all')}">
                    All
                  </button>
                </li>
                ${repeat(
                  response.modules,
                  (result: Module) => result,
                  (result, index) => html`
                    <li
                      data-index=${index}
                      class=" ${this.activeVertical === result.verticalConfigId
                        ? 'active'
                        : ''}"
                    >
                      <button
                        @click="${() =>
                          this.setActiveVertical(result.verticalConfigId)}"
                      >
                        ${this.setVerticalTitle(result.verticalConfigId)}
                      </button>
                    </li>
                  `
                )}
              </ul>
            </div>
          `
        : ``}
    `;
  }

  mobileCloseModalTemplate() {
    return this.modalFiltersOpenClose
      ? html`<button
          type="button"
          id="closeModal"
          class="menu-dropdown-close"
          aria-expanded="${this.modalFiltersOpenClose}"
          aria-controls="slider-modal"
          @click=${this.toggleFilterModal}
        >
          <outline-icon-baseline
            name="close"
            aria-hidden="true"
          ></outline-icon-baseline>
          <span class="visually-hidden">Close modal filters</span>
        </button>`
      : null;
  }

  mobileStickyCTATemplate() {
    return this.modalFiltersOpenClose
      ? html`<div class="container-cta-sticky">
          <button
            class="reset-search"
            type="button"
            @click=${(e: Event) => this.reset(e)}
          >
            Clear
          </button>
          <button
            type="button"
            id="close-modal-mobile"
            class="close-modal-mobile btn btn--default btn--small"
            aria-expanded="${this.modalFiltersOpenClose}"
            aria-controls="slider-modal"
            @click=${this.toggleFilterModal}
          >
            Show ${this.totalCount} results

            <outline-icon-baseline
              name="arrowRight"
              size="1.25rem"
            ></outline-icon-baseline>
          </button>
        </div>`
      : null;
  }

  toggleFilterModal() {
    this.modalFiltersOpenClose = !this.modalFiltersOpenClose;
    if (this.modalFiltersOpenClose) {
      document.querySelector('body')!.style.overflow = 'hidden';
      this._trapKeyboardMobileMenu = this._trapKeyboardMobileMenu.bind(this);
      document.addEventListener('keydown', this._trapKeyboardMobileMenu);
    } else {
      document.querySelector('body')!.style.overflow = 'revert';
      document.removeEventListener('keydown', this._trapKeyboardMobileMenu);
      this.backToFocusElementCloseFilter();
    }

    this.focusCloseButton();
  }

  backToFocusElementCloseFilter() {
    const openButtonModal = this.shadowRoot?.querySelector(
      '#openModal'
    ) as HTMLButtonElement;
    if (openButtonModal) {
      openButtonModal?.focus();
    }
  }

  focusCloseButton() {
    setTimeout(() => {
      const closeButtonRef = this.shadowRoot
        ?.querySelector('#slider-modal')
        ?.querySelector('.menu-dropdown-close') as HTMLButtonElement;
      if (closeButtonRef) {
        closeButtonRef?.focus();
      }
    }, 300);
  }

  _trapKeyboardMobileMenu(event: KeyboardEvent) {
    // Get all focusable elements in the Modal
    const focusableElements =
      this.shadowRoot!.querySelector(
        '#slider-modal'
      )?.querySelectorAll<HTMLElement>('button, summary');
    if (!focusableElements) {
      return;
    }
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
      focusableElements[focusableElements.length - 1];

    if (event.key === 'Tab') {
      if (event.shiftKey) {
        if (
          document.activeElement?.shadowRoot?.activeElement?.matches(
            `#${lastFocusableElement.id}`
          )
        ) {
          return;
        }
        if (
          document.activeElement?.shadowRoot?.activeElement?.matches(
            `#${firstFocusableElement.id}`
          )
        ) {
          lastFocusableElement.focus();
          event.preventDefault();
          return;
        }
      }

      if (
        document.activeElement?.shadowRoot?.activeElement?.matches(
          `#${lastFocusableElement.id}`
        )
      ) {
        firstFocusableElement.focus();
        event.preventDefault();
        return;
      }
    }
  }

  render(): TemplateResult {
    if (this.fetchEndpoint.value !== undefined) {
      this.taskValue = this.fetchEndpoint.value;
    }

    const classes = {
      'wrapper': true,
      'is-mobile': this.resizeController.currentBreakpointRange === 0,
      'is-visible': this.displayResults,
    };

    return html`
      ${this.searchFormTemplate()}
      <div class="${classMap(classes)}">
        <div class="yext-results-wrapper">
          ${this.fetchEndpoint.render({
            pending: () => (this.taskValue ? Pending() : noChange),
            complete: data => {
              if (!data) {
                return;
              }

              if (isVerticalSearchResponse(data.response)) {
                return;
              }

              return this.resizeController.currentBreakpointRange === 0
                ? this.mobileVerticalNavTemplate(data.response)
                : this.desktopVerticalNavTemplate(data.response);
            },
            // error: error => html`${error}`,
          })}
          ${this.activeVertical !== 'all'
            ? html`
                <outline-yext-vertical
                  vertical-key="${this.activeVertical}"
                ></outline-yext-vertical>
              `
            : html`
                <main>
                  ${this.fetchEndpoint.render({
                    pending: () =>
                      this.taskValue ? Pending() : noChange,
                    complete: data => {
                      if (!data) {
                        return;
                      }

                      if (isVerticalSearchResponse(data.response)) {
                        return;
                      }

                      return this.displayAll(data.response);
                    },
                    // error: error => html`${error}`,
                  })}
                </main>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'outline-yext-universal': OutlineYextUniversal;
  }
}
