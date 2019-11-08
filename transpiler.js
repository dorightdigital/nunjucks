const parser = require('./nunjucks/src/parser')
const compiler = require('./nunjucks/src/compiler')
const transformer = require('./nunjucks/src/transformer')
const nodes = require('./nunjucks/src/nodes')

const fs = require('fs')
const divider = '\n\n\n------------\n\n\n'

const inputStr = fs.readFileSync(process.argv[2], 'utf8')

const ast = transformer.transform(parser.parse(inputStr), []);

const filters = {
  safe: node => {
    const out = []
    out.push(printNodes(node.args, '@Html(', ')'))
    return out.join('')
  },
  // trim: node => {
  //   const out = []
  //   out.push(printNodes(node.args))
  //   return out.join('')
  // }
}

const getNestedTargets = (container) => {
  let out = []
  if (!container.target.value) {
    out = out.concat(getNestedTargets(container.target))
  } else {
    out = out.concat([container.target.value])
  }
  out = out.concat([container.val.value])
  return out
}

const getNestedVariable = (container) => {
  const arr = getNestedTargets(container)
  return [arr[0] || ''].concat([].concat(arr).splice(1).map(part => `"${part}"`)).join(' \\ ')
}

function printNodes(node, variablePrefix, variablePostfix) {
  const output = []
  const varPrefix = variablePrefix || '@{'
  const varPostfix = variablePostfix || '}'

  if (node instanceof nodes.NodeList) {
    node.children.forEach((n) => {
      output.push(printNodes(n, variablePrefix, variablePostfix))
    })
  } else if (node instanceof nodes.LookupVal || node instanceof nodes.Symbol) {
    output.push(varPrefix)
    if (node.target) {
      output.push('(')
      output.push(getNestedVariable(node))
      output.push(').as[String]')
    } else {
      output.push(node.value)
    }
    output.push(varPostfix)
  } else if (node instanceof nodes.Value) {
    node.iterFields((val) => {
      output.push(val)
    })
  } else if (node instanceof nodes.If || node instanceof nodes.InlineIf) {
    if (node.cond.left) {
      output.push('@if((')
      output.push(node.cond.left.target.value)
      output.push(' \\ "')
      output.push(node.cond.left.val.value)
      output.push('").toOption.isDefined')
      if (node.cond instanceof nodes.Or) {
        output.push(' || ')
      }
      output.push('(')
      output.push(node.cond.right.target.value)
      output.push(' \\ "')
      output.push(node.cond.right.val.value)
      output.push('").toOption.isDefined')
      output.push('){')
      output.push(printNodes(node.body, variablePrefix, variablePostfix))
      output.push('}')
      if (node.else_) {
        output.push('else {')
        output.push(printNodes(node.else_, variablePrefix, variablePostfix))
        output.push('}')
      }
    } else if (node.cond.target) {
      output.push('@if((')
      output.push(getNestedVariable(node.cond))
      output.push(').toOption.isDefined) {')
      output.push(printNodes(node.body, variablePrefix, variablePostfix))
      output.push('}')
      if (node.else_) {
        output.push('else {')
        output.push(printNodes(node.else_, variablePrefix, variablePostfix))
        output.push('}')
      }
    } else {
      output.push('@if(')
      output.push(node.cond.value)
      output.push('.toOption.isDefined) {')
      output.push(printNodes(node.body, variablePrefix, variablePostfix))
      output.push('}')
    }
  } else if (node instanceof nodes.For && node.name.children) {
    output.push('@for((')
    output.push(node.name.children[0].value)
    output.push(', ')
    output.push(node.name.children[1].value)
    output.push(') <- ((')
    output.push(node.arr.target.value)
    output.push(') \\ "')
    output.push(node.arr.val.value)
    output.push('").as[Map[String, String]]){')
    output.push(printNodes(node.body, variablePrefix, variablePostfix))
    output.push('})')
  } else if (node instanceof nodes.For) {
    output.push('@for((')
    output.push(node.name.value)
    output.push(') <- ((')
    output.push(node.arr.target.value)
    output.push(') \\ "')
    output.push(node.arr.val.value)
    output.push('").as[List[String]]){')
    output.push(printNodes(node.body, variablePrefix, variablePostfix))
    output.push('})')
  } else if (node instanceof nodes.Filter) {
    const filterName = node.name.value
    const filterHandler = filters[filterName]
    if (filterHandler) {
      output.push(filterHandler(node))
    } else {
      output.push(`<!-- NO HANDLER FOR FILTER [${filterName}] -->`)
    }
  } else if (node instanceof nodes.Set && node.targets) {
    output.push('@')
    output.push(node.targets[0].value)
    output.push(' = ')
    output.push('@{')
    output.push(printNodes(node.value, '', '').replace(/@/g,''))
    output.push('}')
  } else if (node instanceof nodes.Macro) {
    output.push('@')
    output.push(node.name.value)
    output.push('(')
    output.push(node.args.children.map(child => child.value).join(', '))
    output.push(') {')
    output.push(printNodes(node.body, variablePrefix, variablePostfix))
    output.push('}')
  } else {
    output.push(`[unrecognised ${node.typename}]`)
  }
  return output.join('')
}

const boilerplate = ['@import play.api.libs.json.JsValue', '@(params: JsValue)', ''].join('\n')

console.log(boilerplate + printNodes(ast))



