import { Pipe,  PipeTransform } from "@angular/core"

@Pipe({
  name: 'filter',
  standalone: false
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], field: string, value: any): any[] {
    if (!items || !field || value === undefined || value === null || value === "") {
      return items
    }

    return items.filter((item) => {
      const fieldValue = item[field]
      if (typeof fieldValue === "string") {
        return fieldValue.toLowerCase().includes(value.toLowerCase())
      }
      return fieldValue === value
    })
  }
}
